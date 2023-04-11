import * as core from '@actions/core'
import { mocked } from 'ts-jest/utils'

import Check from '../checks/check'

import { checkEnabled } from './checkEnabled'

jest.mock('@actions/core')

const mockCore = mocked(core, true)

describe('checkEnabled', () => {
  it('does not enable any checks with empty input', () => {
    mockCore.getInput.mockReturnValue('')

    const check = { name: 'check' } as Check

    expect(checkEnabled(check)).toBeFalsy()
  })

  it('does not enable a check when not specified in the input', () => {
    mockCore.getInput.mockReturnValue('enabled-check')

    const check = { name: 'check' } as Check

    expect(checkEnabled(check)).toBeFalsy()
  })

  it('enables a check specified in the input', () => {
    mockCore.getInput.mockReturnValue('enabled-check')

    const check = { name: 'enabled-check' } as Check

    expect(checkEnabled(check)).toBeTruthy()
  })

  it('enables a check specified with multiple checks in the input', () => {
    mockCore.getInput.mockReturnValue('enabled-check,another-enabled-check')

    const check = { name: 'another-enabled-check' } as Check

    expect(checkEnabled(check)).toBeTruthy()
  })

  it('enables a check specified with multiple checks in the input with spaces', () => {
    mockCore.getInput.mockReturnValue('enabled-check,  another-enabled-check')

    const check = { name: 'another-enabled-check' } as Check

    expect(checkEnabled(check)).toBeTruthy()
  })
})
