import * as core from '@actions/core'

import Check from './checks/check'
import bashCheck from './checks/bash'
import jiraLinked from './checks/jiraLinked'
import piiDetection from './checks/piiDetection'
import {
  triggeredByBot,
  belongsToTypeformOrg,
  checkSkipped,
  isDraftPullRequest,
} from './conditions'

const checks: Check[] = [
  bashCheck({
    name: 'secrets-scan',
    inputs: ['githubToken'],
  }),
  jiraLinked,
  piiDetection,
  bashCheck({
    name: 'validate-openapi',
    inputs: [],
  }),
]

async function run(): Promise<void> {
  if (!(await belongsToTypeformOrg())) {
    core.info('Executing outside of Typeform org, skipping all checks')
    return
  }

  if (await triggeredByBot()) {
    core.info('Action triggered by bot, skipping all checks')
    return
  }

  if (await isDraftPullRequest()) {
    core.info('Pull Request is a draft, skipping all checks')
    return
  }

  for (const check of checks) {
    try {
      if (checkSkipped(check)) {
        core.info(`Check '${check.name}' skipped in the workflow`)
      } else {
        core.startGroup(`check: ${check.name}`)
        await check.run()
        core.endGroup()
      }
    } catch (error) {
      core.setFailed(error.message)
    }
  }
}

run()
