import * as core from '@actions/core'
import * as github from '@actions/github'

export default async function jiraLinked(): Promise<boolean> {
  const githubToken = core.getInput('githubToken')

  const octokit = github.getOctokit(githubToken)
  const context = github.context

  if (context.eventName === 'pull_request') {
    const pull_number = context.payload.pull_request?.number as number
    const pr = await octokit.pulls.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number
    })

    // return if PR comes from bot
    return hasJiraIssueKey(pr.data.title) || hasJiraIssueKey(pr.data.head.ref)
  } else if (context.eventName === 'push') {
    // get the commit message
    // check if it's jira linked
  }

  return false
  // how can we prevent the wrong squash?
}

function hasJiraIssueKey(text: string): boolean {
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
