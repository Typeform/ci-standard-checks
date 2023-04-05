import fs from 'fs'
import path from 'path'
import process from 'process'

import * as actionsGlob from '@actions/glob'

export async function glob({
  patterns = [],
  exclude = [],
}: {
  patterns: string[]
  exclude: RegExp[]
}): Promise<string[]> {
  const globber = await actionsGlob.create(patterns.join('\n'))

  const files = (await globber.glob())
    .map((f) => path.relative(process.cwd(), f))
    .filter((f) => !exclude.some((rx) => f.match(rx)))

  return files
}

export function readFile(path: string): string {
  return fs.readFileSync(path, { encoding: 'utf-8' })
}
