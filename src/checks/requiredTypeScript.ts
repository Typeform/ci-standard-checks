import * as core from '@actions/core'
import * as CommentedJSON from 'comment-json'

import { WebhookEventMap } from '@octokit/webhooks-types'

import { github } from '../infrastructure/github'
import * as fs from '../infrastructure/fs'
import { isBot } from '../conditions/triggeredByBot'

import Check from './check'
import ignore, { Ignore as IgnoredFileFilter } from 'ignore'

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

  const filter = getIgnoreFilter()

  const errors = [
    ...(await checkJsUsage(pr.number, filter)),
    ...(await checkTsConfig(filter)),
  ]

  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }

  core.info(
    'OK! No forbidden JS additions/changes or missing "tsconfig.json" settings'
  )

  const adoption = await measureTsAdoption(filter)
  const commentId = await github.pinComment(
    pr.number,
    /## TypeScript adoption/,
    `## TypeScript adoption
Current adoption level: **${formatAdoptionPercentage(adoption)}**
`
  )

  core.info(`Pinned adoption % comment: #${commentId}`)

  return true
}

export async function checkJsUsage(
  prNumber: number,
  filter: IgnoredFileFilter = getIgnoreFilter()
): Promise<string[]> {
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
        `Only TypeScript is allowed for new changes; migrate file or extract changes to TS file: ${f.filename}`
    )
}

export function formatAdoptionPercentage(adoption: number): string {
  return adoption.toLocaleString(undefined, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })
}

export async function measureTsAdoption(
  filter: IgnoredFileFilter = getIgnoreFilter()
): Promise<number> {
  const jsFiles = await fs.glob({
    patterns: ['**/*.js', '**/*.jsx'],
    exclude: filter,
  })
  const tsFiles = await fs.glob({
    patterns: ['**/*.ts', '**/*.tsx'],
    exclude: filter,
  })

  const jsLines = jsFiles
    .map((f) => fs.readFile(f).split('\n').length)
    .reduce((total, lines) => total + lines, 0)
  const tsLines = tsFiles
    .map((f) => fs.readFile(f).split('\n').length)
    .reduce((total, lines) => total + lines, 0)

  return tsLines / (jsLines + tsLines)
}

export async function checkTsConfig(
  filter: IgnoredFileFilter = getIgnoreFilter()
): Promise<string[]> {
  const errors = []

  const tsconfigFiles = await fs.glob({
    patterns: ['**/tsconfig.json'],
    exclude: filter,
  })

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

export function isForbiddenJSFile(
  filename: string,
  filter: IgnoredFileFilter = getIgnoreFilter()
): boolean {
  const jsPattern = /\.jsx?$/i

  return jsPattern.test(filename) && !filter.ignores(filename)
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

export function getIgnoreFilter(): IgnoredFileFilter {
  const filter = ignore().add([
    '*.spec.js',
    '*.spec.jsx',
    '*.test.js',
    '*.test.jsx',
    'node_modules/',
  ])

  try {
    filter.add(fs.readFile('.gitignore'))
  } catch {
    // no gitignore
  }

  try {
    filter.add(fs.readFile('.eslintignore'))
  } catch {
    // no eslintignore
  }

  return filter
}
