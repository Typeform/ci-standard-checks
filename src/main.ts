import bashCheck from './checks/bash'
import * as core from '@actions/core'
import jiraLinked from './checks/jiraLinked'

const checks = [
  bashCheck({
    name: 'secrets-scan',
    inputs: ['dockerUsername', 'dockerPassword']
  }),
  jiraLinked
]

async function run(): Promise<void> {
  for (const check of checks) {
    try {
      await check()
    } catch (error) {
      core.setFailed(error.message)
    }
  }
}

run()
