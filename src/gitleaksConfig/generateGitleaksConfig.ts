import fs from 'fs'
import path from 'path'

import getScriptsDir from '../getScriptsDir'

import { mergeGitleaksConfig } from './mergeGitleaksConfig'

export const LOCAL_CONFIG = '.gitleaks.toml'

/**
 * Builds the gitleaks config of the secrets-scan check (global config + the
 * repo's `.gitleaks.toml` allowlist) in a directory inside the workspace, so it
 * can be mounted into the gitleaks container like the repo itself. Returns the
 * path of the generated file.
 */
export function generateGitleaksConfig(
  workspace: string = process.env.GITHUB_WORKSPACE || process.cwd(),
): string {
  const globalToml = fs.readFileSync(
    path.join(getScriptsDir(), 'secrets-scan', 'global_config.toml'),
    'utf-8',
  )
  const localPath = path.join(workspace, LOCAL_CONFIG)
  const localToml = fs.existsSync(localPath)
    ? fs.readFileSync(localPath, 'utf-8')
    : undefined

  const dir = fs.mkdtempSync(path.join(workspace, 'tmp.'))
  const file = path.join(dir, 'gitleaks_config.toml')
  fs.writeFileSync(file, mergeGitleaksConfig(globalToml, localToml))
  return file
}

export async function gitleaksConfigEnv(): Promise<{
  [key: string]: string
}> {
  return { GITLEAKS_CONFIG_FILE: generateGitleaksConfig() }
}
