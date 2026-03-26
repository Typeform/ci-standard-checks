import { describe, it, expect, vi } from 'vitest'

import { github } from '../infrastructure/github'

import { belongsToTypeformOrg } from './belongsToTypeformOrg'

const mockGithub = vi.mocked(github, true)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockContext = mockGithub.context as any

vi.mock('../infrastructure/github')

describe('outsideTypeformOrg', () => {
  it('returns true when repo owned by Typeform', async () => {
    mockContext.repo = {
      owner: 'Typeform',
      repo: 'ci-standard-checks',
    }

    await expect(belongsToTypeformOrg()).resolves.toBeTruthy()
  })

  it('returns true when repo owned by typeform-security', async () => {
    mockContext.repo = {
      owner: 'typeform-security',
      repo: 'security-infra',
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
