import { describe, it, expect, vi } from 'vitest'
import * as core from '@actions/core'
import * as exec from '@actions/exec'

import bashCheck from './bash'
import getScriptsDir from '../getScriptsDir'

vi.mock('@actions/exec')
vi.mock('@actions/core')
vi.mock('../getScriptsDir')

const mockCore = vi.mocked(core, true)
const mockExec = vi.mocked(exec, true)
vi.mocked(getScriptsDir).mockReturnValue('/scripts')

describe('bash check', () => {
  it('calls script exec', () => {
    mockExec.exec.mockResolvedValue(0)

    mockCore.getInput
      .mockReturnValueOnce('username')
      .mockReturnValueOnce('password')

    const c = bashCheck({
      name: 'secret-scan',
      inputs: ['dockerUsername', 'dockerPassword'],
    })

    c.run()

    expect(mockExec.exec.mock.calls.length).toBe(1)
    const call = mockExec.exec.mock.calls[0]
    expect(call[0]).toEqual('bash')
    expect(call[1]).toEqual(['/scripts/secret-scan/run.sh'])

    const execOptions = call[2]
    expect(execOptions?.env?.DOCKERUSERNAME).toEqual('username')
    expect(execOptions?.env?.DOCKERPASSWORD).toEqual('password')
  })
})
