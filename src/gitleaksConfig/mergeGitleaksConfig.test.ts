import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, describe, expect, it } from 'vitest'

import { generateGitleaksConfig } from './generateGitleaksConfig'
import { mergeGitleaksConfig } from './mergeGitleaksConfig'

const tests = path.join(__dirname, 'tests')
const read = (...p: string[]) =>
  fs.readFileSync(path.join(tests, ...p), 'utf-8')
const globalToml = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'scripts',
    'secrets-scan',
    'global_config.toml',
  ),
  'utf-8',
)

// golden/*.toml and variant/*.merged.gitleaks.toml are the stdout of the old
// container (gitleaks_config_generator.py, tomlkit 0.11.1), see tests/regenerate.sh
describe('mergeGitleaksConfig is byte-identical to the old generator', () => {
  it('without a repo .gitleaks.toml', () => {
    expect(mergeGitleaksConfig(globalToml)).toBe(
      read('golden', 'none.merged.gitleaks.toml'),
    )
  })

  const fixtures = fs
    .readdirSync(path.join(tests, 'fixtures'))
    .map((f) => f.replace('.gitleaks.toml', ''))

  it('has the expected fixtures', () => {
    expect(fixtures).toEqual(
      expect.arrayContaining([
        'automations',
        'audiences-service',
        'terraform-shared',
        'agent-orchestrator',
        'renderer',
        'tracking-proxy-api',
        'synthetic',
      ]),
    )
  })

  it.each(fixtures)('with the %s .gitleaks.toml', (name) => {
    expect(
      mergeGitleaksConfig(
        globalToml,
        read('fixtures', `${name}.gitleaks.toml`),
      ),
    ).toBe(read('golden', `${name}.merged.gitleaks.toml`))
  })

  it.each([
    'no-trailing-comma',
    'comment-no-comma',
    'eof-blank-lines',
    'comment-blank',
  ])('with the %s global config layout', (name) => {
    expect(
      mergeGitleaksConfig(
        read('variant', `${name}.global.toml`),
        read('variant', `${name}.repo.toml`),
      ),
    ).toBe(read('variant', `${name}.merged.gitleaks.toml`))
  })
})

describe('mergeGitleaksConfig errors', () => {
  it('rejects invalid TOML', () => {
    expect(() => mergeGitleaksConfig(globalToml, '[allowlist\nx=1')).toThrow()
  })

  it('rejects a repo config without [allowlist] (the old generator crashed too)', () => {
    expect(() => mergeGitleaksConfig(globalToml, 'title = "x"\n')).toThrow(
      /allowlist/,
    )
  })

  it('ignores a scalar equal to the global one and rejects others', () => {
    expect(
      mergeGitleaksConfig(globalToml, '[allowlist]\nregexTarget = "line"\n'),
    ).toBe(globalToml + '\n')
    expect(() =>
      mergeGitleaksConfig(globalToml, '[allowlist]\nregexTarget = "match"\n'),
    ).toThrow(/array/)
  })
})

describe('generateGitleaksConfig', () => {
  const dirs: string[] = []
  afterEach(() =>
    dirs
      .splice(0)
      .forEach((d) => fs.rmSync(d, { recursive: true, force: true })),
  )

  function workspace(localConfig?: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'))
    dirs.push(dir)
    if (localConfig !== undefined)
      fs.writeFileSync(path.join(dir, '.gitleaks.toml'), localConfig)
    return dir
  }

  it('writes the merged config inside the workspace', () => {
    const ws = workspace(read('fixtures', 'renderer.gitleaks.toml'))
    const file = generateGitleaksConfig(ws)
    expect(file.startsWith(ws + path.sep)).toBe(true)
    expect(fs.readFileSync(file, 'utf-8')).toBe(
      read('golden', 'renderer.merged.gitleaks.toml'),
    )
  })

  it('uses only the global config when the repo has no .gitleaks.toml', () => {
    const file = generateGitleaksConfig(workspace())
    expect(fs.readFileSync(file, 'utf-8')).toBe(
      read('golden', 'none.merged.gitleaks.toml'),
    )
  })
})
