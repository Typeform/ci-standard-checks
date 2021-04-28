import {mocked} from 'ts-jest/utils'
import * as core from '@actions/core'
import * as github from '@actions/github'

import jiraLinked from '../../src/checks/jiraLinked'

jest.mock('@actions/exec')
jest.mock('@actions/core')

const mockCore = mocked(core, true)
const mockGithub = mocked(github, true)

test.skip('call jira linked on a PR', async () => {
  process.env['GITHUB_REPOSITORY'] = 'Typeform/ci-standard-checks'

  mockGithub.context.eventName = 'pull_request'
  mockGithub.context.payload.pull_request = {
    number: 5
  }
  mockCore.getInput.mockReturnValueOnce('<github-token-here>')

  const result = await jiraLinked()

  expect(result).toBe(false)
})
