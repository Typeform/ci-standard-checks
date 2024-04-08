import { mocked } from 'ts-jest/utils'

import {
  github,
  PullRequestsAssociatedWithCommitResponse,
  PullsGetResponse,
} from '../infrastructure/github'
import { BOT_USERS } from '../conditions/triggeredByBot'

import jiraLinked, { hasJiraIssueKey } from './jiraLinked'

const mockGithub = mocked(github, true)

jest.mock('../infrastructure/github')

describe('Jira Linked check', () => {
  describe('pull_request event', () => {
    const pullRequestResponse = {
      title: '',
      head: {
        ref: '',
      },
      user: {
        login: '',
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
      pullRequestResponse.title = 'JIRA-123: This title has a key'
      pullRequestResponse.head.ref = 'no-issue-name-here'

      await expect(jiraLinked.run()).resolves.toBeTruthy()
    })

    it('returns true for PR with Jira Issue key in branch name', async () => {
      pullRequestResponse.title = 'No Jira issue here'
      pullRequestResponse.head.ref = 'JIRA-123-there-is-an-issue-here'

      await expect(jiraLinked.run()).resolves.toBeTruthy()
    })

    it.each(BOT_USERS)('returns true for bot users [%s]', async (botUser) => {
      pullRequestResponse.title = 'No Jira isue here'
      pullRequestResponse.head.ref = 'neither-here'
      pullRequestResponse.user.login = botUser

      await expect(jiraLinked.run()).resolves.toBeTruthy()
    })

    it('throws error for PR without Jira Issue key and non bot user', async () => {
      pullRequestResponse.title = 'No Jira isue here'
      pullRequestResponse.head.ref = 'neither-here'
      pullRequestResponse.user.login = 'regular-user'

      await expect(jiraLinked.run()).rejects.toThrow()
    })

    it('returns true for reverts', async () => {
      pullRequestResponse.title =
        'Revert "fix(dependabot): bump @somedependency from stable to broken"'
      pullRequestResponse.head.ref =
        'revert-4242-dependabot/npm_and_yarn/typeform/dependency-version'

      await expect(jiraLinked.run()).resolves.toBeTruthy()
    })
  })

  describe('push event', () => {
    const noPullRequestsAssociatedWithCommitResponse = {}

    beforeEach(() => {
      mockGithub.context.eventName = 'push'
      mockGithub.getPullRequestsAssociatedWithCommit.mockResolvedValue(
        noPullRequestsAssociatedWithCommitResponse as PullRequestsAssociatedWithCommitResponse
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
      const pullRequestsAssociatedWithCommitResponse = [
        { state: 'closed', merged_at: '2021-05-20T10:00:10Z' },
      ]
      mockGithub.getPullRequestsAssociatedWithCommit.mockResolvedValueOnce(
        pullRequestsAssociatedWithCommitResponse as PullRequestsAssociatedWithCommitResponse
      )

      await expect(jiraLinked.run()).resolves.toBeTruthy()
    })
    it('returns false if the commit is associated with a closed PR which was not merged that does not have Jira Issue keys', async () => {
      mockGithub.context.payload.commits = [
        { message: 'fix(JIRA-123): some fix commit' },
        { message: 'feat(no-key): some feat commit' },
        { message: 'chore(JIRA-123): some chore commit' },
      ]
      const pullRequestsAssociatedWithCommitResponse = [{ state: 'closed' }]
      mockGithub.getPullRequestsAssociatedWithCommit.mockResolvedValueOnce(
        pullRequestsAssociatedWithCommitResponse as PullRequestsAssociatedWithCommitResponse
      )

      await expect(jiraLinked.run()).rejects.toThrow()
    })

    it('returns false if the commit is associated with a closed PR which has an empty merged date that does not have Jira Issue keys', async () => {
      mockGithub.context.payload.commits = [
        { message: 'fix(JIRA-123): some fix commit' },
        { message: 'feat(no-key): some feat commit' },
        { message: 'chore(JIRA-123): some chore commit' },
      ]
      const pullRequestsAssociatedWithCommitResponse = [
        { state: 'closed', merged_at: '' },
      ]
      mockGithub.getPullRequestsAssociatedWithCommit.mockResolvedValueOnce(
        pullRequestsAssociatedWithCommitResponse as PullRequestsAssociatedWithCommitResponse
      )

      await expect(jiraLinked.run()).rejects.toThrow()
    })
    it('returns false if the commit is associated with a non-merged PR that does not have Jira Issue keys', async () => {
      mockGithub.context.payload.commits = [
        { message: 'fix(JIRA-123): some fix commit' },
        { message: 'feat(no-key): some feat commit' },
        { message: 'chore(JIRA-123): some chore commit' },
      ]
      const pullRequestsAssociatedWithCommitResponse = [{ state: 'open' }]
      mockGithub.getPullRequestsAssociatedWithCommit.mockResolvedValueOnce(
        pullRequestsAssociatedWithCommitResponse as PullRequestsAssociatedWithCommitResponse
      )

      await expect(jiraLinked.run()).rejects.toThrow()
    })
  })

  it('returns true for reverts', async () => {
    mockGithub.context.eventName = 'push'
    mockGithub.context.payload.commits = [
      {
        id: 'revert',
        message:
          'Revert "fix(dependabot): bump @typeform/dependency from stable to broken"',
        author: { username: 'typeformer' },
      },
    ]
    const pullRequestsAssociatedWithCommitResponse = [{ state: 'open' }]
    mockGithub.getPullRequestsAssociatedWithCommit.mockResolvedValueOnce(
      pullRequestsAssociatedWithCommitResponse as PullRequestsAssociatedWithCommitResponse
    )

    await expect(jiraLinked.run()).resolves.toBeTruthy()
  })
})

describe('hasJiraIssueKey', () => {
  it.each([
    'EING-123',
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
