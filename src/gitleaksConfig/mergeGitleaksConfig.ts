import { parse } from 'smol-toml'

import { ArrayInfo, scanAllowlist } from './scanToml'

type Table = Record<string, unknown>

interface Edit {
  offset: number
  text: string
}

function decode(raw: string): string {
  const v = (parse(`v = ${raw}`) as Table).v
  if (typeof v !== 'string') throw new Error(`Not a TOML string: ${raw}`)
  return v
}

function allowlistOf(doc: Table, what: string): Table {
  const a = doc.allowlist
  if (typeof a !== 'object' || a === null || Array.isArray(a)) {
    throw new Error(`${what} has no [allowlist] table`)
  }
  return a as Table
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Where the old container's `tomlkit.dumps()` put an element appended to an
 * existing multi-line array: a new line indented 4 spaces before the `]`
 * line, comma separated, no trailing comma after the last one.
 */
function appendToArray(text: string, array: ArrayInfo, raws: string[]): Edit[] {
  const last = array.items[array.items.length - 1]
  if (!last) throw new Error('Cannot append to an empty global array')
  const gap = text.slice(last.end, array.close)
  const m = /^([ \t]*,)?[ \t]*(#[^\n]*)?\n([ \t]*)$/.exec(gap)
  if (!m) {
    throw new Error(
      'Unsupported global_config.toml array layout (need `]` on its own line)',
    )
  }
  const edits: Edit[] = []
  if (!m[1]) edits.push({ offset: last.end, text: ',' })
  edits.push({
    offset: array.close - m[3].length,
    text: raws
      .map((r, i) => `    ${r}${i < raws.length - 1 ? ',' : ''}\n`)
      .join(''),
  })
  return edits
}

/**
 * Merge the repo's `.gitleaks.toml` allowlist into the global gitleaks config.
 *
 * Same contract as Typeform/gitleaks-config's gitleaks_config_generator.py: for
 * every array in the repo's [allowlist] (except `description`), values not
 * already present are appended to the global array, or the array is created.
 * The output is byte-identical to the generator's stdout (tomlkit 0.11.1)
 * because the global text is kept as is and only edited at the insertion
 * points; repo strings are copied verbatim (quote style included).
 */
export function mergeGitleaksConfig(
  globalToml: string,
  repoToml?: string,
): string {
  // print() in the old generator adds a final newline
  if (repoToml === undefined) return globalToml + '\n'

  const globalDoc = parse(globalToml) as Table
  const repoDoc = parse(repoToml) as Table
  const globalAllowlist = allowlistOf(globalDoc, 'global config')
  const repoAllowlist = allowlistOf(repoDoc, '.gitleaks.toml')
  const globalScan = scanAllowlist(globalToml)
  const repoScan = scanAllowlist(repoToml)
  if (!globalScan)
    throw new Error('global config: [allowlist] must be a plain table')
  if (!repoScan)
    throw new Error('.gitleaks.toml: [allowlist] must be a plain table')

  const edits: Edit[] = []
  let newKeys = ''

  for (const [key, value] of Object.entries(repoAllowlist)) {
    if (key === 'description') continue

    if (!Array.isArray(value)) {
      // The old generator only tolerated a scalar equal to the global one
      if (sameJson(value, globalAllowlist[key])) continue
      throw new Error(`.gitleaks.toml: allowlist.${key} must be an array`)
    }
    const tokens = repoScan.arrays.get(key)?.items ?? []
    if (
      tokens.length !== value.length ||
      value.some((v, i) => typeof v !== 'string' || decode(tokens[i].raw) !== v)
    ) {
      throw new Error(
        `.gitleaks.toml: allowlist.${key} must be an array of strings`,
      )
    }

    const existing = globalAllowlist[key]
    if (existing !== undefined && !Array.isArray(existing)) {
      throw new Error(`global config: allowlist.${key} is not an array`)
    }
    const seen = new Set<string>((existing as string[] | undefined) ?? [])
    const added: string[] = []
    tokens.forEach((token, i) => {
      if (seen.has(value[i] as string)) return
      seen.add(value[i] as string)
      added.push(token.raw)
    })
    if (added.length === 0) continue

    const globalArray = globalScan.arrays.get(key)
    if (existing === undefined) {
      newKeys += `${key} = [${added.join(', ')}]\n`
    } else if (globalArray) {
      edits.push(...appendToArray(globalToml, globalArray, added))
    } else {
      throw new Error(`global config: cannot locate allowlist.${key}`)
    }
  }

  if (newKeys) {
    const before = globalToml.slice(0, globalScan.bodyEnd)
    edits.push({
      offset: globalScan.bodyEnd,
      text: (before.endsWith('\n') || before === '' ? '' : '\n') + newKeys,
    })
  }

  let out = globalToml
  for (const e of edits.sort((a, b) => b.offset - a.offset)) {
    out = out.slice(0, e.offset) + e.text + out.slice(e.offset)
  }
  return out + '\n'
}
