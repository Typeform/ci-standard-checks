import * as core from '@actions/core'

import bashCheck from './checks/bash'
import jiraLinked from './checks/jiraLinked'
import Check from './checks/check'

const checks: Check[] = [
  bashCheck({
    name: 'secrets-scan',
    inputs: ['dockerUsername', 'dockerPassword'],
  }),
  jiraLinked,
]

async function run(): Promise<void> {
  for (const check of checks) {
    core.startGroup(`check: ${check.name}`)
    try {
      await check.run()
    } catch (error) {
      core.setFailed(error.message)
    }
    core.endGroup()
  }
}

run()
