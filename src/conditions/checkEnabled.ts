import * as core from '@actions/core'

import Check from '../checks/check'

export function checkEnabled(check: Check): boolean {
  const enabledChecks = core
    .getInput('enableChecks')
    .split(',')
    .map((s) => s.trim())
  return enabledChecks.includes(check.name)
}
