import * as core from '@actions/core'
import * as CommentedJSON from 'comment-json'
import { WebhookEventMap } from '@octokit/webhooks-types'
import ignore, { Ignore as IgnoredFileFilter } from 'ignore'

import { github } from '../infrastructure/github'
import * as fs from '../infrastructure/fs'
import { isBot } from '../conditions/triggeredByBot'

import Check from './check'

const JS_TS_CHECK_COMMENT_REGEX = /^\s*\/\/\s*@ts-check/gm

type TsConfig = {
  compilerOptions?: {
    strict?: boolean
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
  optional: false,
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

const getFileContent = (filename: string) => {
  try {
    return fs.readFile(filename)
  } catch (_) {
    return ''
  }
}

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
  const filesWithContent = await Promise.all(
    files.map((f) => ({ ...f, fileContent: getFileContent(f.filename) }))
  )
  const forbiddenJsFiles = filesWithContent.filter((f, index) =>
    isForbiddenJSFile(f.filename, f.fileContent, filter)
  )

  const renamedJsFiles = filesWithContent.filter(
    (f) =>
      f.previous_filename &&
      isForbiddenJSFile(f.previous_filename) &&
      !forbiddenJsFiles.includes(f)
  )
  const tsconfigFiles = await fs.glob({
    patterns: ['**/tsconfig.json'],
    exclude: filter,
  })

  const errors: Error[] = []

  if (forbiddenJsFiles.length || tsconfigFiles.length) {
    errors.push(
      ...(await checkJsUsage(forbiddenJsFiles)),
      ...(await checkTsConfig(tsconfigFiles))
    )
  }

  if (forbiddenJsFiles.length || renamedJsFiles.length || errors.length > 0) {
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
  const typedJsFiles = jsFiles.filter((file) => {
    const fileContent = fs.readFile(file)
    return !!fileContent.match(JS_TS_CHECK_COMMENT_REGEX)
  })
  const tsFiles = await fs.glob({
    patterns: ['**/*.ts', '**/*.tsx'],
    exclude: filter,
  })

  const untypedFiles = jsFiles.filter((f) => !typedJsFiles.includes(f))
  const typedFiles = [...tsFiles, ...typedJsFiles]

  const untypedLines = untypedFiles
    .map((f) => fs.readFile(f).split('\n').length)
    .reduce((total, lines) => total + lines, 0)
  const typedLines = typedFiles
    .map((f) => fs.readFile(f).split('\n').length)
    .reduce((total, lines) => total + lines, 0)

  return typedLines / (untypedLines + typedLines)
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
  fileContent = '',
  filter: IgnoredFileFilter = getIgnoreFilter()
): boolean {
  const jsPattern = /\.jsx?$/i
  const hasJsExtension = jsPattern.test(filename) && !filter.ignores(filename)
  const appliesTypescriptViaComment = !!fileContent.match(
    JS_TS_CHECK_COMMENT_REGEX
  )

  return hasJsExtension && !appliesTypescriptViaComment
}

export function missingTsConfigSettings(tsconfig: TsConfig): string[] {
  const errors: string[] = []

  if (tsconfig.compilerOptions?.allowUnreachableCode !== false) {
    errors.push('compilerOptions.allowUnreachableCode must be false')
  }

  if (
    (tsconfig.compilerOptions?.strict !== true &&
      tsconfig.compilerOptions?.noImplicitAny !== true) ||
    tsconfig.compilerOptions?.noImplicitAny === false
  ) {
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
    'mock*',
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
