import * as core from '@actions/core'

import Check from '../checks/check'

export function checkSkipped(check: Check): boolean {
  const skippedChecks = core
    .getInput('skipChecks')
    .split(',')
    .map((s) => s.trim())
  return skippedChecks.includes(check.name)
}
