import * as core from '@actions/core'

import Check from './checks/check'
import bashCheck from './checks/bash'
import piiDetection from './checks/piiDetection'
import requiredTypeScript from './checks/requiredTypeScript'
import {
  triggeredByBot,
  belongsToTypeformOrg,
  checkSkipped,
  checkEnabled,
  isDraftPullRequest,
} from './conditions'

const mandatoryChecks: Check[] = [
  bashCheck({
    name: 'secrets-scan',
    inputs: ['githubToken'],
  }),
  piiDetection,
]

const additionalChecks: Check[] = [
  requiredTypeScript,
  bashCheck({
    name: 'validate-openapi',
    inputs: [],
  }),
]

async function run(): Promise<void> {
  let checks: Check[] = mandatoryChecks

  if (!(await belongsToTypeformOrg())) {
    core.info('Executing outside of Typeform org, skipping all checks')
    return
  }

  if (await triggeredByBot()) {
    core.info('Action triggered by bot, skipping all checks')
    return
  }

  if (!(await isDraftPullRequest())) {
    checks = checks.concat(additionalChecks)
  }

  for (const check of checks) {
    try {
      if (checkSkipped(check)) {
        core.info(`Check '${check.name}' skipped in the workflow`)
      } else if (check.optional && !checkEnabled(check)) {
        core.info(`Optional check '${check.name}' not enabled in the workflow`)
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
