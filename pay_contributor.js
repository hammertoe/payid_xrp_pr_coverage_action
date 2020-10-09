const { PayIdClient, Wallet,
	XrpClient, XrplNetwork,
	XrpPayIdClient, XpringClient } = require('xpring-js')

const core = require('@actions/core')
const github = require('@actions/github');

async function run() {

    if (github.context.eventName !== "pull_request") {
	core.setFailed("Can only run on pull requests!");
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

    
    const user = await octokit.request('GET /users/{username}', {
	username: username
    }).data

    const bio = user.bio || ''
    const payIds = bio.match(/(\S+\$\S+\.\S+)/g)
    console.log("found payids:", payIds)

    if (payIds && payIds.length > 0) {
	const num = payIds.length

	// Calculate the amount to pay, paying each evenly
	const payid_amount = Math.floor(Math.min(amount, max_payout / num))

	let message = "## Payout info\n"
	for(let i=0; i<num; i++) {
	    let payId = payIds[i]
	    const resolvedXAddress = await xrpPayIdClient.xrpAddressForPayId(payId)
	    message += `- ${payid_amount} ${payId} ${resolvedXAddress}`
	}
    }

    console.log("getting comments")
    const { data: comments } = await octokit.issues.listComments({
	...repo,
	issue_number: pullRequestNumber,
    });

    console.log("find out comment")
    const comment = comments.find((comment) => {
	return (
	    comment.user.login === "github-actions[bot]" &&
		comment.body.startsWith("## Payout info\n")
	);
    });

    console.log("creating comment")
    // If yes, update that
    if (comment) {
	console.log("found existing comment")
	await octokit.issues.updateComment({
	    ...repo,
	    comment_id: comment.id,
	    body: message
	});
	// if not, create a new comment
    } else {
	console.log("creating new comment")
	await octokit.issues.createComment({
	    ...repo,
	    issue_number: pullRequestNumber,
	    body: message
	});
    }
}

run();
