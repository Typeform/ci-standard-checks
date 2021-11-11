import { WebhookEventMap } from '@octokit/webhooks-types'

import { github } from '../infrastructure/github'

export async function isDraftPullRequest(): Promise<boolean> {
  if (github.context.eventName === 'pull_request') {
    return checkPullRequest()
  }
  return false
}

async function checkPullRequest(): Promise<boolean> {
  const pullPayload = github.context.payload as WebhookEventMap['pull_request']
  const pr = await github.getPullRequest(pullPayload.pull_request.number)

  return Boolean(pr.draft)
}
