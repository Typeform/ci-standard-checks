import * as core from '@actions/core'
import * as CommentedJSON from 'comment-json'

import { WebhookEventMap } from '@octokit/webhooks-types'

import { github } from '../infrastructure/github'
import * as fs from '../infrastructure/fs'
import { isBot } from '../conditions/triggeredByBot'

import Check from './check'

type TsConfig = {
  compilerOptions?: {
    allowUnreachableCode?: boolean
    noImplicitAny?: boolean
  }
}

const requiredTypeScript: Check = {
  name: 'required-typescript',
  optional: true,
  async run(): Promise<boolean> {
    if (github.context.eventName === 'pull_request') {
      return checkPullRequest()
    }

    core.info(
      'Required TypeScript only runs on "pull_request" events. Skipping...'
    )
    return true
  },
}
export default requiredTypeScript

async function checkPullRequest(): Promise<boolean> {
  const pullPayload = github.context.payload as WebhookEventMap['pull_request']
  const pr = await github.getPullRequest(pullPayload.pull_request.number)

  const prUser = pr.user?.login || ''

  if (isBot(prUser)) {
    core.info(`PR is from bot user ${prUser}. Skipping check`)
    return true
  }

  core.info(
    'Scanning PR files for forbidden JS additions/changes or missing "tsconfig.json" settings'
  )
  core.info(`Title: ${pr.title}`)
  core.info(`Branch: ${pr.head.ref}`)

  const errors = [
    ...(await checkJsUsage(pr.number)),
    ...(await checkTsConfig()),
  ]

  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }

  core.info(
    'OK! No forbidden JS additions/changes or missing "tsconfig.json" settings'
  )
  return true
}

export async function checkJsUsage(prNumber: number): Promise<string[]> {
  const files = await github.getPullRequestFiles(prNumber)

  const jsFiles = files.filter((f) => isForbiddenJSFile(f.filename))

  const overallJsAdditions = jsFiles.reduce((additions, f) => {
    return additions + f.additions - f.deletions
  }, 0)

  if (overallJsAdditions <= 0) {
    // overall, JS adoption is decreasing. either code is being migrated,
    // or it is being extracted to somewhere else, or deleted completely
    return []
  }

  // only warn about files *reducing* TS adoption - that is, files adding
  // new JS lines
  return jsFiles
    .filter((f) => f.additions > f.deletions)
    .map(
      (f) =>
        `Only TypeScript is allowed for new changes; migrate file or extract changes to TS file: ${f}`
    )
}

export async function checkTsConfig(): Promise<string[]> {
  const errors = []

  const tsconfigFiles = await fs.glob('**/tsconfig.json', [/^node_modules\//])

  for (const filename of tsconfigFiles) {
    const content = fs.readFile(filename)
    let missingSettings: string[] = []

    if (!content) continue

    try {
      const parsed = CommentedJSON.parse(content)

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('expected an object')
      }

      missingSettings = missingTsConfigSettings(parsed as TsConfig)
    } catch (e) {
      errors.push(`${filename} is not valid JSON: "${e}"`)
      continue
    }

    errors.push(
      ...missingSettings.map(
        (err) => `${filename} doesn't meet minimum requirements: ${err}`
      )
    )
  }

  return errors
}

export function isForbiddenJSFile(filename: string): boolean {
  const isTest = /\.(spec|test)\.jsx?$/i
  const isJS = /\.jsx?$/i

  return isJS.test(filename) && !isTest.test(filename)
}

export function missingTsConfigSettings(tsconfig: TsConfig): string[] {
  const errors = []

  if (tsconfig.compilerOptions?.allowUnreachableCode !== false) {
    errors.push('compilerOptions.allowUnreachableCode must be false')
  }

  if (tsconfig.compilerOptions?.noImplicitAny !== true) {
    errors.push('compilerOptions.noImplicitAny must be true')
  }

  return errors
}
