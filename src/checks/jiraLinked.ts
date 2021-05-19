import * as core from '@actions/core'
import { WebhookEventMap } from '@octokit/webhooks-types'

import { github } from '../infrastructure/github'
import { isBot } from '../triggeredByBot'

import Check from './check'

const jiraLinked: Check = {
  name: 'jira-linked',
  async run(): Promise<boolean> {
    if (github.context.eventName === 'pull_request') {
      return checkPullRequest()
    } else if (github.context.eventName === 'push') {
      return checkPush()
    }

    core.info(
      'Jira linked will only run on "push" and "pull_request" events. Skipping...'
    )
    return true
  },
}
export default jiraLinked

async function checkPullRequest(): Promise<boolean> {
  const pullPayload = github.context.payload as WebhookEventMap['pull_request']
  const pr = await github.getPullRequest(pullPayload.pull_request.number)

  const prUser = pr.data.user?.login || ''

  if (isBot(prUser)) {
    core.info(`PR is from bot user ${prUser}. Skipping check`)
    return true
  }

  core.info('Scanning PR Title and Branch Name for Jira Key Reference')
  core.info(`Title: ${pr.data.title}`)
  core.info(`Branch: ${pr.data.head.ref}`)

  const isJiraLinked =
    hasJiraIssueKey(pr.data.title) || hasJiraIssueKey(pr.data.head.ref)

  if (!isJiraLinked)
    throw new Error('Jira Issue key not present in PR title or branch name!')

  return true
}

async function checkPush(): Promise<boolean> {
  const pushPayload = github.context.payload as WebhookEventMap['push']
  const prs = await github.getPullRequestsAssociatedWithCommit()
  if (prs.data.length === 1 && prs.data[0]?.state === 'merged') {
    core.info(
      'A merged Pull Request associated with commit has been found. Skipping...'
    )
    return true
  }
  const errors = pushPayload.commits
    .filter(
      (c) =>
        !hasJiraIssueKey(c.message) &&
        !isBot(c.author.name) &&
        !isBot(c.author.username || '')
    )
    .map((c) => `Commit ${c.id} is missing Jira Issue key`)

  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }

  core.info('OK! All commits in push have a Jira Issue key')
  return true
}

export function hasJiraIssueKey(text: string): boolean {
  if (!text) {
    return false
  }

  const jiraInvalidIssueNumberPrefix = '0' // JIRA issue numbers can't start with 0, but the Regex doesn't catch it
  // https://confluence.atlassian.com/stashkb/integrating-with-custom-jira-issue-key-313460921.html
  const jiraMatcher = /((?<!([A-Z]{1,10})-?)[A-Z]+-\d+)/g

  const matchedText = text.match(jiraMatcher)?.shift() ?? ''
  const isMatch = !!matchedText

  const zeroedJiraKeys = Array(10)
    .fill(1)
    .map((_, i) => `-${jiraInvalidIssueNumberPrefix.repeat(i + 1)}`)

  const noZeroKeyIssue =
    matchedText &&
    !zeroedJiraKeys.some((issueKey) => matchedText.includes(issueKey))

  return !!isMatch && !!noZeroKeyIssue
}
