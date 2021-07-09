import * as path from 'path'

import * as core from '@actions/core'
import * as exec from '@actions/exec'

import getScriptsDir from '../getScriptsDir'

import Check from './check'

interface BashCheckParams {
  name: string
  inputs: string[]
}

export default function bashCheck({ name, inputs }: BashCheckParams): Check {
  return {
    name,
    async run(): Promise<number> {
      const envInputs = inputs.reduce((result, input) => {
        result[input.toUpperCase()] = core.getInput(input)
        return result
      }, {} as { [key: string]: string })

      const TOKEN =
        'KEY12341423059125984598019382980423190dsaahjldshf192312831098312dfasjhlf21321'
      const env = {
        ...process.env,
        ...envInputs,
      } as { [key: string]: string }

      return exec.exec('bash', [path.join(getScriptsDir(), name, 'run.sh')], {
        env,
      })
    },
  }
}
