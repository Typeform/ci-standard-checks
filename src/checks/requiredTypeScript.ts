import * as fs from 'fs'

import * as core from '@actions/core'
import * as glob from '@actions/glob'

import { WebhookEventMap } from '@octokit/webhooks-types'

import { github } from '../infrastructure/github'
import { isBot } from '../conditions/triggeredByBot'

import Check from './check'

type TSConfig = {
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

  return files
    .filter((f) => isForbiddenJSFile(f.filename))
    .map(
      (f) =>
        `Only TypeScript is allowed for new changes, file must be migrated: ${f}`
    )
}

export async function checkTsConfig(): Promise<string[]> {
  const errors = []

  const globber = await glob.create('**/tsconfig.json')
  const tsconfigFiles = await globber.glob()

  for (const filename of tsconfigFiles) {
    const content = fs.readFileSync(filename, { encoding: 'utf-8' })

    if (!content) continue

    const missingSettings = missingTSConfigSettings(JSON.parse(content))

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

export function missingTSConfigSettings(tsconfig: TSConfig): string[] {
  const errors = []

  if (tsconfig.compilerOptions?.allowUnreachableCode !== false) {
    errors.push('compilerOptions.allowUnreachableCode must be false')
  }

  if (tsconfig.compilerOptions?.noImplicitAny !== true) {
    errors.push('compilerOptions.noImplicitAny must be true')
  }

  return errors
}
