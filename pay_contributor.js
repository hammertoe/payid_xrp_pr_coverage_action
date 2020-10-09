const { PayIdClient, Wallet,
	XrpClient, XrplNetwork,
	XrpPayIdClient, XpringClient } = require('xpring-js')

const core = require('@actions/core')
const github = require('@actions/github')
const convert = require('xml-js');
const fs = require('fs');

const matchAll = require('string.prototype.matchall')
matchAll.shim()

function getCoverageFromFile(filename) {
    const xmlFile = fs.readFileSync(filename, 'utf8')
    const jsonFile = JSON.parse(convert.xml2json(xmlFile,
						 {compact: true, spaces: 2}))
    const cov = jsonFile.coverage._attributes['line-rate']

    return round(parseFloat(cov)*100)
}

async function run() {

    if (github.context.eventName !== "pull_request") {
	core.setFailed("Can only run on pull requests!")
	return;
    }
    
    // Get our parameters from the environment
    const wallet_seed = core.getInput('wallet_secret')
    const environment = core.getInput('environment').toLowerCase()
    const server = core.getInput('server')
    const max_payout = core.getInput('max_payout')
    const old_coverage_file = core.getInput('old_coverage_file')
    const new_coverage_file = core.getInput('new_coverage_file')
    const token = core.getInput('repo_token')

    if (!old_coverage_file || !new_coverage_file) {
	console.log("Missing coverage files")
	process.exit(0)
    }

    old_cov_rate = getCoverageFromFile(old_coverage_file)
    new_cov_rate = getCoverageFromFile(new_coverage_file)
    
    const octokit = github.getOctokit(token)

    const context = github.context
    const repo = context.repo
    const pullRequestNumber = context.payload.pull_request.number
    const username = context.payload.pull_request.user.login

    const action = context.payload.action

    // Get all the comments
    const { data: comments } = await octokit.issues.listComments({
	...repo,
	issue_number: pullRequestNumber,
    });

    const messageHeader = "## Payout info\n"
    // Find if we already have a comment
    const comment = comments.find((comment) => {
	return (
	    comment.user.login === "github-actions[bot]" &&
		comment.body.startsWith(messageHeader)
	);
    });

//    if (action == 'closed' && comment) {
    if (comment) {
	// PR Closed and we have a payment comment
	console.log("matching")
	const payments = comment.body.matchAll(/- (.+?) XRP ⇒ (.+?) \((.+?)\)/g)
	console.log(payments)

	let message = messageHeader
	message += "The following payments were made:"
	for (const payment of payments) {
	    const amountXrp = parseFloat(payment[0])
	    const amountDrops = amountXrp * 1000000
	    const payId = payment[1]
	    const xrpAddress = payment[2]
	    console.log(`Paying ${payId} ({xrpAddress}) amount ${amountDrops}`)
	    try {
		const transactionHash = await xpringClient.send(amountDrops,
								xrpAddress,
								wallet)
		console.log(transactionHash)
		message += `- ${payid_amount_xrp} XRP ⇒ ${payId} (${resolvedXAddress})`
		message += `  - txn id: [${transactionHash}](https://xrpscan.com/tx/${transactionHash})`
	    } catch(e) {
		message += `- *ERROR* ${payid_amount_xrp} XRP ⇒ ${payId} (${resolvedXAddress})`
		console.log("Could not pay", payId, e)
	    }
	}
	await octokit.issues.updateComment({
	    ...repo,
	    comment_id: comment.id,
	    body: message
	});
    }
    
    const { data } = await octokit.request('GET /users/{username}', {
	username: username
    })
    
    const bio = data.bio || ''
    const payIds = bio.match(/(\S+\$\S+\.\S+)/g)
    console.log("found payids:", payIds)

    if (payIds == undefined || payIds.length == 0) {
	console.log("No PayIDs found")
	process.exit(0)
    }
    
    const xrpPayIdClient = new XrpPayIdClient(environment)
    const num = payIds.length

    let message = messageHeader
    if (new_cov_rate > old_cov_rate) {
	let amount = new_cov_rate - old_cov_rate
    
	// Calculate the amount to pay, paying each evenly
	const payid_amount = Math.floor(Math.min(amount, max_payout / num))
	const payid_amount_xrp = Number(payid_amount / 1000000).toFixed(2)
    
	message += `Coverage increased by: ${amount}%\n`
	message += "When this PR is closed, the following payments will be made:\n"
	for(let i=0; i<num; i++) {
	    let payId = payIds[i]
	    const resolvedXAddress = await xrpPayIdClient.xrpAddressForPayId(payId)
	    message += `- ${payid_amount_xrp} XRP ⇒ ${payId} (${resolvedXAddress})`
	}
    } else {
	message += "This PR does not increase test coverage. No payments will be made :("
    }

    // We have an existing comment so update that
    if (comment) {
	await octokit.issues.updateComment({
	    ...repo,
	    comment_id: comment.id,
	    body: message
	});
    // if not, create a new comment
    } else {
	await octokit.issues.createComment({
	    ...repo,
	    issue_number: pullRequestNumber,
	    body: message
	});
    }
}

run();
