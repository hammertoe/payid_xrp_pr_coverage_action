const { PayIdClient, Wallet,
	XrpClient, XrplNetwork,
	XrpPayIdClient, XpringClient } = require('xpring-js')

const core = require('@actions/core')
const github = require('@actions/github')

const matchAll = require('string.prototype.matchall')
matchAll.shim()

async function run() {

    if (github.context.eventName !== "pull_request") {
	core.setFailed("Can only run on pull requests!")
	return;
    }
    
    // Get our parameters from the environment
    const wallet_seed = core.getInput('wallet_secret')
    const environment = core.getInput('environment').toLowerCase()
    const server = core.getInput('server')
    const amount = core.getInput('amount')
    const max_payout = core.getInput('max_payout')
    const old_coverage_file = core.getInput('old_coverage_file')
    const new_coverage_file = core.getInput('new_coverage_file')
    const token = core.getInput('repo_token')

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

	for (const payment of payments) {
	    const amountXrp = payment[0]
	    const payId = payment[1]
	    const xrpAddress = payment[2]
	    console.log(amountXrp, payId, xrpAddress)
	}
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

    // Calculate the amount to pay, paying each evenly
    const payid_amount = Math.floor(Math.min(amount, max_payout / num))
    const payid_amount_xrp = Number(payid_amount / 1000000).toFixed(2)
    
    let message = messageHeader
    message += "When this PR is closed, the following payments will be made:\n"
    for(let i=0; i<num; i++) {
	let payId = payIds[i]
	const resolvedXAddress = await xrpPayIdClient.xrpAddressForPayId(payId)
	message += `- ${payid_amount_xrp} XRP ⇒ ${payId} (${resolvedXAddress})`
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
