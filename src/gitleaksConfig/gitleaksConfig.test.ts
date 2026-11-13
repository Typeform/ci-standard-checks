import fs from 'fs'
import path from 'path'

import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

import { mergeGitleaksConfig } from './gitleaksConfig'

const fixtures = path.join(__dirname, 'fixtures')
const globalToml = fs.readFileSync(
  path.join(__dirname, '../../scripts/secrets-scan/global_config.toml'),
  'utf-8',
)
// The merged allowlists produced by the old generator (Typeform/gitleaks-config,
// tomlkit 0.11.1) for the real .gitleaks.toml of each repo.
const expectedAllowlists: { [repo: string]: unknown } = JSON.parse(
  fs.readFileSync(path.join(fixtures, 'expected-allowlists.json'), 'utf-8'),
)

describe('mergeGitleaksConfig', () => {
  it('returns the global config untouched without a repo config', () => {
    expect(mergeGitleaksConfig(globalToml)).toBe(globalToml)
  })

  it.each(Object.keys(expectedAllowlists))(
    'matches the old generator for %s',
    (repo) => {
      const repoToml = fs.readFileSync(
        path.join(fixtures, `${repo}.gitleaks.toml`),
        'utf-8',
      )

      expect(parse(mergeGitleaksConfig(globalToml, repoToml))).toEqual({
        ...parse(globalToml),
        allowlist: expectedAllowlists[repo],
      })
    },
  )

  it('appends new values, skips duplicates and creates missing lists', () => {
    const merged = parse(
      mergeGitleaksConfig(
        "[allowlist]\ndescription = 'global'\npaths = ['a']\n",
        "[allowlist]\ndescription = 'repo'\npaths = ['a', 'b', 'b']\ncommits = ['c1']\nregexes = []\n",
      ),
    )

    expect(merged).toEqual({
      allowlist: { description: 'global', paths: ['a', 'b'], commits: ['c1'] },
    })
  })

  it('fails on a repo config the old generator could not merge', () => {
    expect(() => mergeGitleaksConfig(globalToml, 'title = "x"\n')).toThrow(
      'no [allowlist]',
    )
    expect(() =>
      mergeGitleaksConfig(globalToml, '[allowlist]\nregexTarget = "line"\n'),
    ).toThrow('must be an array')
  })
})
