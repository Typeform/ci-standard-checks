import * as core from '@actions/core'

import Check from './checks/check'
import bashCheck from './checks/bash'
import jiraLinked from './checks/jiraLinked'
import { triggeredByBot, checkSkipped } from './conditions'

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
      if (await triggeredByBot()) {
        core.info('Action triggered by bot, skipping all checks')
      } else if (checkSkipped(check)) {
        core.info(`Check '${check.name}' skipped in the workflow`)
      } else {
        await check.run()
      }
    } catch (error) {
      core.setFailed(error.message)
    }
    core.endGroup()
  }
}

run()
