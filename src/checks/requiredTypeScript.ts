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

type Error = {
  file: string
  message: string
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

  const files = await github.getPullRequestFiles(pr.number)
  const jsFiles = files.filter((f) => isForbiddenJSFile(f.filename, filter))
  const tsconfigFiles = await fs.glob({
    patterns: ['**/tsconfig.json'],
    exclude: filter,
  })

  const errors: Error[] = []

  if (jsFiles.length || tsconfigFiles.length) {
    errors.push(
      ...(await checkJsUsage(jsFiles)),
      ...(await checkTsConfig(tsconfigFiles))
    )
  }

  if (jsFiles.length || errors.length > 0) {
    const adoption = await measureTsAdoption(filter)
    const commentId = await github.pinComment(
      pr.number,
      /## TypeScript adoption/,
      `## TypeScript adoption
Current adoption level: **${formatAdoptionPercentage(adoption)}**
`
    )

    core.info(`Pinned adoption % comment: #${commentId}`)
  }

  if (errors.length) {
    for (const err of errors) {
      core.error(err.message, {
        file: err.file,
      })
    }

    throw new Error(
      'One or more files do not meet the Required TypeScript standard; check error annotations for more information.\n' +
        'If you think this is incorrect, you can ignore files and folders using ".eslintignore" or ".gitignore".'
    )
  }

  core.info(
    'OK! JS adoption not increasing, and no missing "tsconfig.json" settings'
  )

  return true
}

export async function checkJsUsage(
  files: { filename: string; additions: number; deletions: number }[]
): Promise<Error[]> {
  const overallJsAdditions = files.reduce((additions, f) => {
    return additions + (f.additions ?? 0) - (f.deletions ?? 0)
  }, 0)

  if (overallJsAdditions <= 0) {
    // overall, JS adoption is decreasing. either code is being migrated,
    // or it is being extracted to somewhere else, or deleted completely
    return []
  }

  // only warn about files *reducing* TS adoption - that is, files adding
  // new JS lines
  return files
    .filter((f) => (f.additions ?? 0) > (f.deletions ?? 0))
    .map((f) => ({
      file: f.filename,
      message: `Only TypeScript is allowed for new changes; migrate file or extract changes to TS file`,
    }))
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

async function checkTsConfig(files: string[]): Promise<Error[]> {
  const errors: Error[] = []

  for (const filename of files) {
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
      errors.push({ file: filename, message: `Not valid JSON: "${e}"` })
      continue
    }

    errors.push(
      ...missingSettings.map((err) => ({
        file: filename,
        message: `Minimum requirements not met: ${err}`,
      }))
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
  const errors: string[] = []

  if (tsconfig.compilerOptions?.allowUnreachableCode !== false) {
    errors.push('compilerOptions.allowUnreachableCode must be false')
  }

  if (tsconfig.compilerOptions?.noImplicitAny !== true) {
    errors.push('compilerOptions.noImplicitAny must be true')
  }

  return errors
}

function getIgnoreFilter(): IgnoredFileFilter {
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
