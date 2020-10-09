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


    const context = github.context
    const repo = context.repo
    const pullRequestNumber = context.payload.pull_request.number

    console.log(JSON.stringify(context, null, 4))
    const octokit = github.getOctokit(token)

    const message = "## Payout info\ndummy info"
    
    const { data: comments } = await octokit.issues.listComments({
	...repo,
	issue_number: pullRequestNumber,
    });
    
    const comment = comments.find((comment) => {
	return (
	    comment.user.login === "github-actions[bot]" &&
		comment.body.startsWith("## Payout info\n")
	);
    });

    // If yes, update that
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
    
    // Instantiate instance of a wallet with seed
    const wallet = Wallet.generateWalletFromSeed(
	wallet_seed,
    )

    // Create the clients we need
    const xrpClient = new XrpClient(server, environment)
    const payIdClient = new XrpPayIdClient(environment)
    const xpringClient = new XpringClient(payIdClient, xrpClient)

    // Find all payids in the commit message
    const payIds = commitmsg.match(/(\S+\$\S+\.\S+)/g)

    // If we have no payids found then exit with success
    const num = payIds.length
    if (num < 1) {
	console.log("No PayIDs found")
	process.exit(0)
    }

    // Calculate the amount to pay, paying each evenly
    const payid_amount = Math.floor(Math.min(amount, max_payout / num))

    // Make each payment and await success
    for(let i=0; i<num; i++) {
	let payId = payIds[i]
	console.log(`Paying ${payId} amount ${payid_amount}`)
	try {
	    const transactionHash = await xpringClient.send(payid_amount,
							    payId,
							    wallet)
	    console.log(transactionHash)
	} catch(e) {
	    console.log("Could not pay", payId, e)
	}
	
    }
}

run();
