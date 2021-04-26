import bashCheck from './checks/bash'
import * as core from '@actions/core'

const checks = [
  bashCheck({
    name: 'secret-scan',
    inputs: ['dockerUsername', 'dockerPassword']
  })
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
