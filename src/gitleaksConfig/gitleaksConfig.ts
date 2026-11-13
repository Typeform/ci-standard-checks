import fs from 'fs'
import path from 'path'
import { isDeepStrictEqual } from 'util'

import { parse, stringify } from 'smol-toml'

import getScriptsDir from '../getScriptsDir'

type Allowlist = { [key: string]: unknown }

/**
 * Merges the repo's `.gitleaks.toml` allowlist into the global gitleaks config.
 * Same rule as the old Typeform/gitleaks-config generator: every allowlist list
 * of the repo (all keys but `description`) is appended to the global one,
 * skipping values that are already there. Without a repo config the global
 * config is returned untouched.
 */
export function mergeGitleaksConfig(
  globalToml: string,
  repoToml?: string,
): string {
  if (repoToml === undefined) return globalToml

  const config = parse(globalToml)
  const allowlist = config.allowlist as Allowlist
  const repoAllowlist = parse(repoToml).allowlist as Allowlist | undefined
  if (!repoAllowlist) {
    throw new Error('.gitleaks.toml has no [allowlist] table')
  }

  for (const [key, values] of Object.entries(repoAllowlist)) {
    if (key === 'description') continue
    if (!Array.isArray(values)) {
      throw new Error(`.gitleaks.toml: allowlist.${key} must be an array`)
    }
    for (const value of values) {
      const merged = (allowlist[key] ??= []) as unknown[]
      if (!merged.some((existing) => isDeepStrictEqual(existing, value))) {
        merged.push(value)
      }
    }
  }

  return stringify(config)
}

/**
 * Writes the merged config inside the workspace (so it can be mounted into the
 * gitleaks container) and returns the env that tells run.sh where it is.
 */
export async function gitleaksConfigEnv(): Promise<{ [key: string]: string }> {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd()
  const globalToml = fs.readFileSync(
    path.join(getScriptsDir(), 'secrets-scan', 'global_config.toml'),
    'utf-8',
  )
  const repoPath = path.join(workspace, '.gitleaks.toml')
  const repoToml = fs.existsSync(repoPath)
    ? fs.readFileSync(repoPath, 'utf-8')
    : undefined

  const file = path.join(
    fs.mkdtempSync(path.join(workspace, 'tmp.')),
    'gitleaks_config.toml',
  )
  fs.writeFileSync(file, mergeGitleaksConfig(globalToml, repoToml))
  return { GITLEAKS_CONFIG_FILE: file }
}
