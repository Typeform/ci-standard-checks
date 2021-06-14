import { WebhookEventMap } from '@octokit/webhooks-types'

import { github } from '../infrastructure/github'

export const BOT_USERS = [
  'Snyk bot',
  'dependabot[bot]',
  'dependabot-preview[bot]',
  'tf-security',
  'seti-tf',
]

export async function triggeredByBot(): Promise<boolean> {
  if (github.context.eventName === 'pull_request') {
    return checkPullRequest()
  } else if (github.context.eventName === 'push') {
    return checkPush()
  }
  return false
}

async function checkPullRequest(): Promise<boolean> {
  const pullPayload = github.context.payload as WebhookEventMap['pull_request']
  const pr = await github.getPullRequest(pullPayload.pull_request.number)

  const prUser = pr.user?.login || ''

  return isBot(prUser)
}

async function checkPush(): Promise<boolean> {
  const pushPayload = github.context.payload as WebhookEventMap['push']
  return pushPayload.commits
    .map((c) => isBot(c.author.name) || isBot(c.author.username || ''))
    .reduce((a, b) => a && b, true)
}

export function isBot(user: string): boolean {
  return BOT_USERS.includes(user)
}
