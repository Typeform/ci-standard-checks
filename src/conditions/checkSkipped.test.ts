import * as core from '@actions/core'
import { mocked } from 'ts-jest/utils'

import Check from '../checks/check'

import { checkSkipped } from './checkSkipped'

jest.mock('@actions/core')

const mockCore = mocked(core, true)

describe('checkSkipped', () => {
  it('does not skip any checks with empty input', () => {
    mockCore.getInput.mockReturnValue('')

    const check = { name: 'check' } as Check

    expect(checkSkipped(check)).toBeFalsy()
  })

  it('does not skip a check when not specified in the input', () => {
    mockCore.getInput.mockReturnValue('skipped-check')

    const check = { name: 'check' } as Check

    expect(checkSkipped(check)).toBeFalsy()
  })

  it('skips a check specified in the input', () => {
    mockCore.getInput.mockReturnValue('skipped-check')

    const check = { name: 'skipped-check' } as Check

    expect(checkSkipped(check)).toBeTruthy()
  })

  it('skips a check specified with multiple checks in the input', () => {
    mockCore.getInput.mockReturnValue('skipped-check,another-skipped-check')

    const check = { name: 'another-skipped-check' } as Check

    expect(checkSkipped(check)).toBeTruthy()
  })

  it('skips a check specified with multiple checks in the input with spaces', () => {
    mockCore.getInput.mockReturnValue('skipped-check,  another-skipped-check')

    const check = { name: 'another-skipped-check' } as Check

    expect(checkSkipped(check)).toBeTruthy()
  })
})
