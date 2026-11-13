import * as path from 'path'

import * as core from '@actions/core'
import * as exec from '@actions/exec'

import getScriptsDir from '../getScriptsDir'

import Check from './check'

interface BashCheckParams {
  name: string
  optional?: boolean
  inputs: string[]
  /** extra env vars for the script, computed right before it runs */
  extraEnv?: () => Promise<{ [key: string]: string }>
}

export default function bashCheck({
  name,
  optional,
  inputs,
  extraEnv,
}: BashCheckParams): Check {
  return {
    name,
    optional,
    async run(): Promise<number> {
      const envInputs = inputs.reduce(
        (result, input) => {
          result[input.toUpperCase()] = core.getInput(input)
          return result
        },
        {} as { [key: string]: string },
      )

      const extra = extraEnv ? await extraEnv() : {}

      const env = {
        ...process.env,
        ...envInputs,
        ...extra,
      } as { [key: string]: string }

      return exec.exec('bash', [path.join(getScriptsDir(), name, 'run.sh')], {
        env,
      })
    },
  }
}
