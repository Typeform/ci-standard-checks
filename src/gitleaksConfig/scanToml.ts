/**
 * Minimal TOML scanner. It does NOT decode TOML: smol-toml does that. It only
 * finds where the `[allowlist]` table of a gitleaks config lives in the source
 * text, and the exact source text (offsets) of every string in its arrays, so
 * the merge can copy and append raw text instead of re-serialising a document.
 */

export interface StringToken {
  raw: string
  start: number
  end: number
}

export interface ArrayInfo {
  items: StringToken[]
  /** offset of the closing bracket */
  close: number
}

export interface AllowlistTable {
  arrays: Map<string, ArrayInfo>
  /** offset of the line start of the next table header, or end of text */
  bodyEnd: number
}

class Scanner {
  private i = 0
  constructor(private readonly t: string) {}

  scanAllowlist(): AllowlistTable | undefined {
    let table: AllowlistTable | undefined
    let inAllowlist = false
    const t = this.t

    while (this.i < t.length) {
      this.skipBlank()
      if (this.i >= t.length) break
      const lineStart = t.lastIndexOf('\n', this.i - 1) + 1

      if (t[this.i] === '[') {
        const isArrayTable = t[this.i + 1] === '['
        const close = t.indexOf(']', this.i)
        if (close === -1) throw new Error('Unterminated table header')
        const name = t.slice(this.i + (isArrayTable ? 2 : 1), close).trim()
        if (inAllowlist) {
          table!.bodyEnd = this.skipBlankLinesBack(lineStart)
          return table
        }
        if (!isArrayTable && name === 'allowlist') {
          inAllowlist = true
          table = { arrays: new Map(), bodyEnd: t.length }
        }
        this.i = close + (isArrayTable ? 2 : 1)
        this.skipToEol()
        continue
      }

      const key = this.readKey()
      this.skipInlineWs()
      if (t[this.i] !== '=') throw new Error(`Expected '=' after key ${key}`)
      this.i++
      this.skipInlineWs()
      const value = this.readValue()
      if (inAllowlist && value.array) table!.arrays.set(key, value.array)
      this.skipToEol()
    }
    if (table) table.bodyEnd = this.skipBlankLinesBack(t.length)
    return table
  }

  /**
   * tomlkit keeps the blank lines that trail a table after the keys appended to
   * it, but comments stay before them: new keys go after the last non-blank line.
   */
  private skipBlankLinesBack(end: number): number {
    const t = this.t
    let pos = end
    while (pos > 0) {
      const prevStart = t.lastIndexOf('\n', pos - 2) + 1
      if (t.slice(prevStart, pos).trim() !== '') break
      pos = prevStart
    }
    return pos
  }

  private readKey(): string {
    const t = this.t
    const c = t[this.i]
    if (c === '"' || c === "'") {
      const s = this.readString()
      return s.raw.slice(1, -1)
    }
    const start = this.i
    while (this.i < t.length && !/[\s=]/.test(t[this.i])) this.i++
    return t.slice(start, this.i)
  }

  private readValue(): { array?: ArrayInfo } {
    const t = this.t
    const c = t[this.i]
    if (c === '"' || c === "'") {
      this.readString()
      return {}
    }
    if (c === '[') {
      this.i++
      const items: StringToken[] = []
      for (;;) {
        this.skipBlank()
        if (this.i >= t.length) throw new Error('Unterminated array')
        if (t[this.i] === ']') {
          const close = this.i
          this.i++
          return { array: { items, close } }
        }
        if (t[this.i] === '"' || t[this.i] === "'") {
          items.push(this.readString())
        } else {
          this.readValue()
        }
        this.skipBlank()
        if (t[this.i] === ',') this.i++
      }
    }
    if (c === '{') {
      this.i++
      for (;;) {
        this.skipBlank()
        if (this.i >= t.length) throw new Error('Unterminated inline table')
        if (t[this.i] === '}') {
          this.i++
          return {}
        }
        this.readKey()
        this.skipInlineWs()
        this.i++ // '='
        this.skipInlineWs()
        this.readValue()
        this.skipBlank()
        if (t[this.i] === ',') this.i++
      }
    }
    while (this.i < t.length && !/[,\]}#\n]/.test(t[this.i])) this.i++
    return {}
  }

  private readString(): StringToken {
    const t = this.t
    const start = this.i
    const q = t[this.i]
    const basic = q === '"'
    if (t.startsWith(q.repeat(3), this.i)) {
      this.i += 3
      for (;;) {
        if (this.i >= t.length) throw new Error('Unterminated string')
        if (basic && t[this.i] === '\\') {
          this.i += 2
        } else if (t.startsWith(q.repeat(3), this.i)) {
          this.i += 3
          // up to two extra quotes may belong to the content
          for (let n = 0; n < 2 && t[this.i] === q; n++) this.i++
          break
        } else {
          this.i++
        }
      }
    } else {
      this.i++
      for (;;) {
        if (this.i >= t.length || t[this.i] === '\n')
          throw new Error('Unterminated string')
        if (basic && t[this.i] === '\\') {
          this.i += 2
        } else if (t[this.i] === q) {
          this.i++
          break
        } else {
          this.i++
        }
      }
    }
    return { raw: t.slice(start, this.i), start, end: this.i }
  }

  /** whitespace, newlines and comments */
  private skipBlank(): void {
    const t = this.t
    while (this.i < t.length) {
      if (/\s/.test(t[this.i])) this.i++
      else if (t[this.i] === '#') this.skipToEol()
      else break
    }
  }

  private skipInlineWs(): void {
    while (this.t[this.i] === ' ' || this.t[this.i] === '\t') this.i++
  }

  private skipToEol(): void {
    const nl = this.t.indexOf('\n', this.i)
    this.i = nl === -1 ? this.t.length : nl
  }
}

export function scanAllowlist(text: string): AllowlistTable | undefined {
  return new Scanner(text).scanAllowlist()
}
