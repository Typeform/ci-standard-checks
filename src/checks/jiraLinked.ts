import * as core from '@actions/core'
import {WebhookEventMap} from '@octokit/webhooks-types'
import {github} from '../infrastructure/github'
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
  }
}
export default jiraLinked

async function checkPullRequest(): Promise<boolean> {
  const pullPayload = github.context.payload as WebhookEventMap['pull_request']
  const pr = await github.getPullRequest(pullPayload.pull_request.number)

  core.info('Scanning PR Title and Branch Name for Jira Key Reference')
  core.info(`Title: ${pr.data.title}`)
  core.info(`Branch: ${pr.data.head.ref}`)

  // return if PR comes from bot
  const isJiraLinked =
    hasJiraIssueKey(pr.data.title) || hasJiraIssueKey(pr.data.head.ref)

  if (!isJiraLinked)
    throw new Error('Jira Issue key not present in PR title or branch name!')

  return true
}

async function checkPush(): Promise<boolean> {
  const pushPayload = github.context.payload as WebhookEventMap['push']
  const errors = pushPayload.commits
    .filter(c => !hasJiraIssueKey(c.message))
    .map(c => `Commit ${c.id} is missing Jira Issue key`)

  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  } else {
    core.info('OK! All commits in push have a Jira Issue key')
  }
  return true
}

export function hasJiraIssueKey(text: string): boolean {
  if (!text) {
    return false
  }

  const JIRA_INVALID_ISSUE = '0' // JIRA issues begin with 1, but the Regex doesn't catch it
  // https://confluence.atlassian.com/stashkb/integrating-with-custom-jira-issue-key-313460921.html
  const jiraMatcher = /((?<!([A-Z]{1,10})-?)[A-Z]+-\d+)/g

  const matchedText = text.match(jiraMatcher)?.shift() ?? ''
  const isMatch = !!matchedText

  const zeroedJiraKeys = Array(10)
    .fill(1)
    .map((_, i) => `-${JIRA_INVALID_ISSUE.repeat(i + 1)}`)

  const noZeroKeyIssue =
    matchedText &&
    !zeroedJiraKeys.some(issueKey => matchedText.includes(issueKey))

  return !!isMatch && !!noZeroKeyIssue
}
