import { Context } from '@actions/github/lib/context'
import { mocked } from 'ts-jest/utils'

import { github, PullsGetResponse } from '../infrastructure/github'

import { belongsToTypeformOrg } from './belongsToTypeformOrg'

const mockGithub = mocked(github, true)
const mockContext = mockGithub.context as any

jest.mock('../infrastructure/github')

describe('outsideTypeformOrg', () => {
  it('returns true when repo owned by Typeform', async () => {
    mockContext.repo = {
      owner: 'Typeform',
      repo: 'ci-standard-checks',
    }

    await expect(belongsToTypeformOrg()).resolves.toBeTruthy()
  })

  it('returns false when repo owned by someone else', async () => {
    mockContext.repo = {
      owner: 'SomeRandomPerson',
      repo: 'ci-standard-checks',
    }

    await expect(belongsToTypeformOrg()).resolves.toBeFalsy()
  })
})
