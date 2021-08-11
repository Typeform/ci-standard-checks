import { mocked } from 'ts-jest/utils'
import * as core from '@actions/core'
import * as exec from '@actions/exec'

import bashCheck from '../../src/checks/bash'
import getScriptsDir from '../../src/getScriptsDir'

jest.mock('@actions/exec')
jest.mock('@actions/core')
jest.mock('../../src/getScriptsDir')

const mockCore = mocked(core, true)
const mockExec = mocked(exec, true)
mocked(getScriptsDir).mockReturnValue('/scripts')

test('bash check calls script exec', () => {
  mockExec.exec.mockResolvedValue(0)

  const c = bashCheck({
    name: 'secret-scan',
    inputs: [],
  })

  c.run()

  expect(mockExec.exec.mock.calls.length).toBe(1)
  const call = mockExec.exec.mock.calls[0]
  expect(call[0]).toEqual('bash')
  expect(call[1]).toEqual(['/scripts/secret-scan/run.sh'])
})
