import { mocked } from 'ts-jest/utils'
import { github, PullsGetResponse } from './infrastructure/github'
import { BOT_USERS, triggeredByBot } from './triggeredByBot'

const mockGithub = mocked(github, true)

jest.mock('./infrastructure/github')

describe('triggeredByBot', () => {
  describe('pul_request event', () => {
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

    it.each(BOT_USERS)('returns true for bot users [%s]', async (botUser) => {
      pullRequestResponse.data.user.login = botUser

      await expect(triggeredByBot()).resolves.toBeTruthy()
    })
  })

  describe('push event', () => {
    beforeEach(() => {
      mockGithub.context.eventName = 'push'
    })

    it.each(BOT_USERS)(
      'returns true if all commits have author.name of a bot user [%s]',
      async (botUser) => {
        mockGithub.context.payload.commits = [
          {
            author: { name: botUser },
          },
          {
            author: { name: botUser },
          },
        ]

        await expect(triggeredByBot()).resolves.toBeTruthy()
      }
    )

    it.each(BOT_USERS)(
      'returns false if not all commits have author.name of a bot user [%s]',
      async (botUser) => {
        mockGithub.context.payload.commits = [
          {
            author: { name: 'not a bot' },
          },
          {
            author: { name: botUser },
          },
        ]

        await expect(triggeredByBot()).resolves.toBeFalsy()
      }
    )

    it.each(BOT_USERS)(
      'returns true if all commits have a author.username of a bot user [%s]',
      async (botUser) => {
        mockGithub.context.payload.commits = [
          {
            author: { username: botUser },
          },
          {
            author: { username: botUser },
          },
        ]

        await expect(triggeredByBot()).resolves.toBeTruthy()
      }
    )

    it.each(BOT_USERS)(
      'returns false if not all commits have a author.username of a bot user [%s]',
      async (botUser) => {
        mockGithub.context.payload.commits = [
          {
            author: { username: 'not a bot' },
          },
          {
            author: { username: botUser },
          },
        ]

        await expect(triggeredByBot()).resolves.toBeFalsy()
      }
    )
  })
})
