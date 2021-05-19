import { mocked } from 'ts-jest/utils'

import {
  github,
  GetPullRequestsAssociatedWithCommitResponse,
  PullsGetResponse,
} from '../infrastructure/github'
import { BOT_USERS } from '../triggeredByBot'

import jiraLinked, { hasJiraIssueKey } from './jiraLinked'

const mockGithub = mocked(github, true)

jest.mock('../infrastructure/github')

describe('Jira Linked check', () => {
  describe('pull_request event', () => {
    const pullRequestResponse = {
      data: {
        title: '',
        head: {
          ref: '',
        },
        user: {
          login: '',
        },
      },
    }

    beforeEach(() => {
      mockGithub.context.eventName = 'pull_request'
      mockGithub.context.payload.pull_request = {
        number: 5,
      }

      mockGithub.getPullRequest.mockResolvedValue(
        pullRequestResponse as PullsGetResponse
      )
    })

    it('returns true for PR with Jira Issue key in title', async () => {
      pullRequestResponse.data.title = 'JIRA-123: This title has a key'
      pullRequestResponse.data.head.ref = 'no-issue-name-here'

      await expect(jiraLinked.run()).resolves.toBeTruthy()
    })

    it('returns true for PR with Jira Issue key in branch name', async () => {
      pullRequestResponse.data.title = 'No Jira issue here'
      pullRequestResponse.data.head.ref = 'JIRA-123-there-is-an-issue-here'

      await expect(jiraLinked.run()).resolves.toBeTruthy()
    })

    it.each(BOT_USERS)('returns true for bot users [%s]', async (botUser) => {
      pullRequestResponse.data.title = 'No Jira isue here'
      pullRequestResponse.data.head.ref = 'neither-here'
      pullRequestResponse.data.user.login = botUser

      await expect(jiraLinked.run()).resolves.toBeTruthy()
    })

    it('throws error for PR without Jira Issue key and non bot user', async () => {
      pullRequestResponse.data.title = 'No Jira isue here'
      pullRequestResponse.data.head.ref = 'neither-here'
      pullRequestResponse.data.user.login = 'regular-user'

      await expect(jiraLinked.run()).rejects.toThrow()
    })
  })

  describe('push event', () => {
    const noGetPullRequestsAssociatedWithCommitResponse = {
      data: {},
    }
    beforeEach(() => {
      mockGithub.context.eventName = 'push'
      mockGithub.getPullRequestsAssociatedWithCommit.mockResolvedValue(
        noGetPullRequestsAssociatedWithCommitResponse as GetPullRequestsAssociatedWithCommitResponse
      )
    })

    it('returns true when all commits have Jira Issue keys', async () => {
      mockGithub.context.payload.commits = [
        { message: 'fix(JIRA-123): some fix commit' },
        { message: 'feat(JIRA-123): some feat commit' },
        { message: 'chore(JIRA-123): some chore commit' },
      ]

      await expect(jiraLinked.run()).resolves.toBeTruthy()
    })

    it.each(BOT_USERS)(
      'returns true for commit with author name in bot users [%s]',
      async (botUser) => {
        mockGithub.context.payload.commits = [
          { message: 'fix(JIRA-123): some fix commit' },
          {
            message: 'feat(no-key): some feat commit',
            author: { name: botUser },
          },
          { message: 'chore(JIRA-123): some chore commit' },
        ]

        await expect(jiraLinked.run()).resolves.toBeTruthy()
      }
    )

    it.each(BOT_USERS)(
      'returns true for commit with author login in bot users [%s]',
      async (botUser) => {
        mockGithub.context.payload.commits = [
          { message: 'fix(JIRA-123): some fix commit' },
          {
            message: 'feat(no-key): some feat commit',
            author: { username: botUser },
          },
          { message: 'chore(JIRA-123): some chore commit' },
        ]

        await expect(jiraLinked.run()).resolves.toBeTruthy()
      }
    )

    it('throws error when at least one commit does not have Jira Issue keys', async () => {
      mockGithub.context.payload.commits = [
        { message: 'fix(JIRA-123): some fix commit' },
        { message: 'feat(no-key): some feat commit' },
        { message: 'chore(JIRA-123): some chore commit' },
      ]

      await expect(jiraLinked.run()).rejects.toThrow()
    })
    it('returns true if the commit is associated with a merged PR, but does not have Jira Issue keys', async () => {
      mockGithub.context.payload.commits = [
        { message: 'fix(JIRA-123): some fix commit' },
        { message: 'feat(no-key): some feat commit' },
        { message: 'chore(JIRA-123): some chore commit' },
      ]
      const getPullRequestsAssociatedWithCommitResponse = {
        data: [{ state: 'merged' }],
      }
      mockGithub.getPullRequestsAssociatedWithCommit.mockResolvedValueOnce(
        getPullRequestsAssociatedWithCommitResponse as GetPullRequestsAssociatedWithCommitResponse
      )

      await expect(jiraLinked.run()).resolves.toBeTruthy()
    })
    it('returns false if the commit is associated with a non-merged PR and does not have Jira Issue keys', async () => {
      mockGithub.context.payload.commits = [
        { message: 'fix(JIRA-123): some fix commit' },
        { message: 'feat(no-key): some feat commit' },
        { message: 'chore(JIRA-123): some chore commit' },
      ]
      const pullsGetAssociatedWithCommitResponse = {
        data: [{ state: 'open' }],
      }
      mockGithub.getPullRequestsAssociatedWithCommit.mockResolvedValueOnce(
        pullsGetAssociatedWithCommitResponse as GetPullRequestsAssociatedWithCommitResponse
      )

      await expect(jiraLinked.run()).rejects.toThrow()
    })
  })
})

describe('hasJiraIssueKey', () => {
  it.each([
    'SETI-123',
    'ABC-789',
    'Some text including JIRA-123 in the middle',
  ])('returns true with issue key', (issueKey) => {
    expect(hasJiraIssueKey(issueKey)).toBeTruthy()
  })

  it('it returns false with text without issue key', () => {
    expect(hasJiraIssueKey('No Jira issue here')).toBeFalsy()
  })

  it('it returns false with branch name without issue key', () => {
    expect(hasJiraIssueKey('neither-here')).toBeFalsy()
  })
})
