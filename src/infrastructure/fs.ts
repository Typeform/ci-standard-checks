import fs from 'fs'
import path from 'path'
import process from 'process'

import * as actionsGlob from '@actions/glob'
import { Ignore as IgnoredFileFilter } from 'ignore'

function isIgnoredFileFilter(
  exclude: RegExp[] | IgnoredFileFilter
): exclude is IgnoredFileFilter {
  return (
    typeof exclude === 'object' &&
    'ignores' in exclude &&
    typeof exclude.ignores === 'function'
  )
}

export async function glob({
  patterns = [],
  exclude = [],
}: {
  patterns: string[]
  exclude: RegExp[] | IgnoredFileFilter
}): Promise<string[]> {
  const globber = await actionsGlob.create(patterns.join('\n'))

  const isNotExcluded = (f: string) =>
    isIgnoredFileFilter(exclude)
      ? !exclude.ignores(f)
      : !exclude.some((rx) => f.match(rx))

  const files = (await globber.glob())
    .map((f) => path.relative(process.cwd(), f))
    .filter(isNotExcluded)

  return files
}

export function readFile(path: string): string {
  return fs.readFileSync(path, { encoding: 'utf-8' })
}
