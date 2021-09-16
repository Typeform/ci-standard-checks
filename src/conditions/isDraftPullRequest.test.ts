import { mocked } from 'ts-jest/utils'
import { github, PullsGetResponse } from '../infrastructure/github'

import { isDraftPullRequest } from './isDraftPullRequest'

const mockGithub = mocked(github, true)

jest.mock('../infrastructure/github')

describe('isDraftPullRequest', () => {
  describe('pul_request event', () => {
    const pullRequestResponse = {
      draft: true,
    }

    beforeEach(() => {
      mockGithub.context.eventName = 'pull_request'

      mockGithub.getPullRequest.mockResolvedValue(
        pullRequestResponse as PullsGetResponse
      )
    })

    it('returns true if pull request is draft', async () => {
      await expect(isDraftPullRequest()).resolves.toBeTruthy()
    })

    it('returns false if pull request is not draft', async () => {
      pullRequestResponse.draft = false

      await expect(isDraftPullRequest()).resolves.toBeFalsy()
    })
  })
})
