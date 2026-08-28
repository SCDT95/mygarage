#!/usr/bin/env bun
/**
 * Unit-system branch detection: the provenance-sensitive half of the unit gate.
 *
 * Phase 3a migrated a batch of call sites off `system === 'imperial'` ternaries
 * and onto `useUnitFormat()`. This exists so the next contributor cannot rebuild
 * TireList's ternary somewhere else and have nothing complain.
 *
 * ★ WHY THIS IS A SCRIPT AND NOT AN ESLINT SELECTOR (plan ruling R3).
 * `no-restricted-syntax` registers purely syntactic selectors against
 * individual nodes and performs no binding or data-flow analysis at all
 * (`node_modules/eslint/lib/rules/no-restricted-syntax.js`). So
 * `unitSystem === 'imperial'` and `theme === 'imperial'` are AST-identical
 * apart from the identifier's spelling, and the two things the gate must do
 * become mutually unsatisfiable in that engine: match on the literal and you
 * reject `theme`; match on the identifier and you miss `resolvedSystem`, which
 * is how `SettingsSystemTab.tsx:81` actually spells it. Deciding which one is a
 * unit system means resolving what the identifier refers to, so it lives here.
 *
 * The provenance-FREE half (raw conversion constants such as `1609.34`, where
 * a numeric literal means the same thing wherever it appears) stays in
 * `eslint.config.js`, scoped by `files:` to the migrated set.
 *
 * ★ BASELINE, KEYED BY OCCURRENCE COUNT, NOT BY SET MEMBERSHIP (ruling R4).
 * ~53 legacy comparisons survive into phase 3b, so this cannot be a clean-room
 * gate yet. It is modelled on `validate-hardcoded-strings.ts`, with one
 * deliberate difference: that script stores `(file, kind, text)` in a `Set`, so
 * adding a SECOND identical `system === 'metric'` to a file that already has
 * one yields the same key and passes. Every key here carries a COUNT and the
 * gate fails when the count RISES. Line numbers stay out of the key so that
 * moving code does not invalidate the baseline.
 *
 * Every baseline entry is a site phase 3b must migrate: `--report` prints them
 * grouped by file so 3b's scope is derived from this gate rather than
 * re-enumerated by hand, which is how this workstream produced seventeen
 * inventories that were floors wearing an inventory's name.
 *
 * Proven against a two-sided corpus (`scripts/units_gate_corpus.py`): eleven
 * positives it must reject, including the destructuring rename and both real
 * production spellings, and five negatives it must accept. Every case names a
 * mutation in `scripts/units_gate_selftest.py` that flips it, because a corpus
 * case that passes identically whether or not the rule exists is an assertion
 * true at t=0 one level up. Run both after changing anything below.
 *
 * Escape hatch: `// units-exempt` on the offending line or the line above,
 * with a reason. Use it for a genuine non-display branch (parsing a stored
 * legacy key, for instance), never to silence a display conversion.
 *
 * Usage:
 *   bun run scripts/validate-units.ts                  # gate
 *   bun run scripts/validate-units.ts --update         # rewrite baseline
 *   bun run scripts/validate-units.ts --report         # phase 3b work list
 *   bun run scripts/validate-units.ts --scan <file>    # JSON, one file (corpus)
 *   bun run scripts/validate-units.ts --baseline <p>   # use another baseline
 * Exit code: 1 when any key's occurrence count exceeds its baseline.
 */

import { createRequire } from 'module'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { ROOT } from './translation-utils'

/**
 * The real TypeScript compiler API, loaded the way Node's resolver would.
 *
 * A bare `import ts from 'typescript'` under Bun resolves to Bun's own built-in
 * shim, which exports `version` and `versionMajorMinor` and nothing else, so
 * `ts.createSourceFile` is `undefined` and every scan would silently find
 * zero comparisons. That is the exact failure mode this gate exists to prevent,
 * so the module is loaded through `createRequire` against the installed
 * package's own `main` field, and the API is verified before anything is
 * scanned.
 */
interface TsNode {
  kind: number
  parent?: TsNode
  text?: string
  left?: TsNode
  right?: TsNode
  operatorToken?: { kind: number }
  expression?: TsNode
  name?: TsNode
  type?: TsNode
  initializer?: TsNode
  getText: (source?: TsSourceFile) => string
  getStart: (source?: TsSourceFile) => number
}

interface TsSourceFile extends TsNode {
  getLineAndCharacterOfPosition: (pos: number) => { line: number; character: number }
}

interface TsApi {
  SyntaxKind: Record<string, number>
  ScriptTarget: Record<string, number>
  ScriptKind: Record<string, number>
  createSourceFile: (
    name: string,
    text: string,
    target: number,
    setParents: boolean,
    kind: number,
  ) => TsSourceFile
  forEachChild: (node: TsNode, cb: (child: TsNode) => void) => void
}

function loadTypeScript(): TsApi {
  const require = createRequire(import.meta.url)
  const pkgDir = join(ROOT, 'node_modules', 'typescript')
  const main = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8')).main as string
  const api = require(join(pkgDir, main)) as TsApi
  if (typeof api.createSourceFile !== 'function' || !api.SyntaxKind?.BinaryExpression) {
    throw new Error(
      'typescript did not expose createSourceFile/SyntaxKind. The scanner would ' +
        'report zero findings for every file. Refusing to run.',
    )
  }
  return api
}

const ts = loadTypeScript()
const SRC_DIR = join(ROOT, 'src')
const DEFAULT_BASELINE = join(ROOT, 'scripts', 'units.baseline.json')

/** The two literals that name a unit system anywhere in this codebase. */
const SYSTEM_LITERALS = new Set(['imperial', 'metric'])

/**
 * Type annotations that do NOT earn an operand its silence.
 *
 * `UnitSystem` is obvious. `string`, `any` and `unknown` are here because
 * `UnitSystem` is assignable to all three, so annotating a unit system as a
 * plain string would otherwise be a one-word way to switch the gate off while
 * still type-checking. `displaySystem: string` is a real production spelling.
 */
const NON_EXEMPTING_ANNOTATION = /\b(UnitSystem|string|any|unknown)\b|'(imperial|metric)'/

const EQUALITY_KINDS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
])

const LITERAL_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
])

export interface Finding {
  file: string
  line: number
  kind: string
  text: string
}

interface BaselineEntry {
  file: string
  kind: string
  text: string
  count: number
}

/** True when the node is the string `'imperial'` or `'metric'`. */
function isSystemLiteral(node: TsNode | undefined): boolean {
  return (
    node !== undefined &&
    LITERAL_KINDS.has(node.kind) &&
    typeof node.text === 'string' &&
    SYSTEM_LITERALS.has(node.text)
  )
}

/**
 * Index every declaration in the file by name, remembering its annotation.
 *
 * Deliberately flat rather than scope-aware: when a name is declared more than
 * once, an operand is only exempted if EVERY declaration of that name is
 * foreign. A scope-aware lookup that picked the nearest declaration would let a
 * shadowing `const theme: Theme` in one function silence a real unit-system
 * `theme` in another.
 */
function indexDeclarations(source: TsSourceFile): Map<string, (string | null)[]> {
  const declared = new Map<string, (string | null)[]>()
  const DECL_KINDS = new Set([
    ts.SyntaxKind.VariableDeclaration,
    ts.SyntaxKind.Parameter,
    ts.SyntaxKind.PropertyDeclaration,
    ts.SyntaxKind.PropertySignature,
    ts.SyntaxKind.BindingElement,
  ])
  const walk = (node: TsNode): void => {
    if (DECL_KINDS.has(node.kind) && node.name?.kind === ts.SyntaxKind.Identifier) {
      const name = node.name.text ?? ''
      const annotation = node.type ? node.type.getText(source) : null
      declared.set(name, [...(declared.get(name) ?? []), annotation])
    }
    ts.forEachChild(node, walk)
  }
  walk(source)
  return declared
}

/**
 * True when the operand is provably NOT a unit system.
 *
 * This is the whole reason the comparison rule cannot be an ESLint selector:
 * it needs the operand's DECLARATION, not its spelling. The rule is
 * fail-closed: an operand that cannot be resolved to a local declaration
 * carrying a foreign type annotation is treated as a unit system, because the
 * cost of a spurious baseline entry is a line of review and the cost of a miss
 * is the defect class this whole phase exists to remove.
 */
function hasForeignProvenance(
  operand: TsNode,
  declared: Map<string, (string | null)[]>,
): boolean {
  if (operand.kind !== ts.SyntaxKind.Identifier) return false
  const annotations = declared.get(operand.text ?? '')
  if (annotations === undefined || annotations.length === 0) return false
  return annotations.every((a) => a !== null && !NON_EXEMPTING_ANNOTATION.test(a))
}

/**
 * True when the comparison sits inside a `placeholder` JSX attribute.
 *
 * Ruling R5: a placeholder is a plausible EXAMPLE value, not a converted
 * quantity, and there is nothing canonical to convert, so
 * `placeholder={system === 'imperial' ? '45000' : '72420'}` is correct code and
 * a gate that flags it is flagging correct code.
 */
function isPlaceholderAttribute(node: TsNode): boolean {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (cur.kind === ts.SyntaxKind.JsxAttribute) {
      return cur.name?.text === 'placeholder'
    }
  }
  return false
}

/** Collapse runs of whitespace so a wrapped expression keys the same as a flat one. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function scanSource(source: string, rel: string): Finding[] {
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const lines = source.split('\n')
  const declared = indexDeclarations(sf)
  const findings: Finding[] = []

  const record = (node: TsNode, kind: string, text: string): void => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
    // Escape hatch: the offending line or the line directly above it.
    if (
      (lines[line - 1] ?? '').includes('units-exempt') ||
      (lines[line - 2] ?? '').includes('units-exempt')
    ) {
      return
    }
    findings.push({ file: rel, line, kind, text })
  }

  const walk = (node: TsNode): void => {
    if (node.kind === ts.SyntaxKind.BinaryExpression && node.operatorToken) {
      if (EQUALITY_KINDS.has(node.operatorToken.kind)) {
        const rightIsLiteral = isSystemLiteral(node.right)
        const leftIsLiteral = isSystemLiteral(node.left)
        if (rightIsLiteral || leftIsLiteral) {
          // Yoda comparisons put the literal on the left; the operand is
          // whichever side is not the literal.
          const operand = (rightIsLiteral ? node.left : node.right) as TsNode
          if (!hasForeignProvenance(operand, declared) && !isPlaceholderAttribute(node)) {
            record(node, 'compare', normalize(node.getText(sf)))
          }
        }
      }
    }
    if (node.kind === ts.SyntaxKind.CaseClause && isSystemLiteral(node.expression)) {
      const literal = node.expression as TsNode
      record(literal, 'switch-case', `case ${normalize(literal.getText(sf))}`)
    }
    ts.forEachChild(node, walk)
  }

  walk(sf)
  return findings
}

/** Every production source file under `src`, tests excluded as in the sibling gates. */
function walkDir(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      walkDir(full, out)
    } else if (
      (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.test.tsx') &&
      !entry.endsWith('.d.ts')
    ) {
      out.push(full)
    }
  }
  return out
}

function scanFile(path: string): Finding[] {
  return scanSource(readFileSync(path, 'utf-8'), relative(ROOT, path))
}

/**
 * Stable identity for a finding: file, kind and expression, never the line.
 *
 * The separator is written as an escape rather than a raw control character so
 * the file stays textual: a literal NUL byte makes git and grep treat the
 * source as binary. A space would be worse than either, because the expression
 * text contains spaces and splitting a space-joined key back apart truncates
 * every comparison to its first token.
 */
const KEY_SEP = '\u0000'

function keyOf(f: { file: string; kind: string; text: string }): string {
  return [f.file, f.kind, f.text].join(KEY_SEP)
}

/** Split a key back into its parts. Inverse of keyOf(). */
function partsOf(key: string): { file: string; kind: string; text: string } {
  const [file, kind, text] = key.split(KEY_SEP)
  return { file, kind, text }
}

function countByKey(findings: Finding[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const f of findings) counts.set(keyOf(f), (counts.get(keyOf(f)) ?? 0) + 1)
  return counts
}

function printReport(findings: Finding[]): void {
  const byFile = new Map<string, Finding[]>()
  for (const f of findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f])
  console.log(
    `\n${findings.length} unit-system branch(es) across ${byFile.size} file(s), the phase 3b work list:\n`,
  )
  for (const [file, hits] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(hits.length).padStart(4)}  ${file}`)
  }
  console.log('')
  for (const [file, hits] of [...byFile].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${file}`)
    for (const h of hits) console.log(`      :${String(h.line).padEnd(5)} [${h.kind}]  ${h.text}`)
  }
  console.log('')
}

function main(): void {
  const argv = process.argv.slice(2)
  const args = new Set(argv)

  const scanIdx = argv.indexOf('--scan')
  if (scanIdx !== -1) {
    const target = argv[scanIdx + 1]
    if (!target) {
      console.error('✗ --scan requires a file path')
      process.exit(2)
    }
    const findings = scanSource(readFileSync(target, 'utf-8'), target)
    console.log(JSON.stringify({ file: target, findings }, null, 1))
    return
  }

  const baseIdx = argv.indexOf('--baseline')
  const baselinePath = baseIdx === -1 ? DEFAULT_BASELINE : (argv[baseIdx + 1] ?? DEFAULT_BASELINE)

  const findings = walkDir(SRC_DIR).flatMap(scanFile)
  const observed = countByKey(findings)

  if (args.has('--update')) {
    const payload: BaselineEntry[] = [...observed]
      .map(([key, count]) => {
        const { file, kind, text } = partsOf(key)
        return { file, kind, text, count }
      })
      .sort((a, b) =>
        a.file === b.file
          ? a.kind === b.kind
            ? a.text.localeCompare(b.text)
            : a.kind.localeCompare(b.kind)
          : a.file.localeCompare(b.file),
      )
    writeFileSync(baselinePath, `${JSON.stringify(payload, null, 1)}\n`)
    const total = payload.reduce((n, e) => n + e.count, 0)
    console.log(`✓ units baseline rewritten: ${total} occurrence(s), ${payload.length} key(s)`)
    return
  }

  let baseline: BaselineEntry[] = []
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'))
  } catch {
    console.error(`✗ units baseline missing at ${relative(ROOT, baselinePath)}, run --update`)
    process.exit(1)
  }
  const allowed = new Map(baseline.map((e) => [keyOf(e), e.count]))

  if (args.has('--report')) printReport(findings)

  const risen = [...observed]
    .filter(([key, count]) => count > (allowed.get(key) ?? 0))
    .map(([key, count]) => ({ key, count, was: allowed.get(key) ?? 0 }))

  if (risen.length > 0) {
    const fresh = risen.reduce((n, r) => n + (r.count - r.was), 0)
    console.error(`\n✗ ${fresh} new unit-system branch(es):\n`)
    for (const r of risen) {
      const { file, kind, text } = partsOf(r.key)
      const sites = findings
        .filter((f) => keyOf(f) === r.key)
        .map((f) => f.line)
        .join(', ')
      console.error(`  ${file}  [${kind}]  ${text}`)
      console.error(`      ${r.was} allowed, ${r.count} found, line(s) ${sites}`)
    }
    console.error(
      '\nRoute the decision through useUnitFormat() (or makeUnitFormat() outside a\n' +
        'component) so the quantity is converted and labelled by the resolved unit\n' +
        'set rather than a binary system. If the branch genuinely is not a display\n' +
        'conversion, mark the line `// units-exempt` with the reason.\n' +
        'Do NOT run --update to silence a new finding: the baseline is phase 3b\'s\n' +
        'work list and it should only shrink.\n',
    )
    process.exit(1)
  }

  const baselineTotal = baseline.reduce((n, e) => n + e.count, 0)
  const fixed = baselineTotal - findings.length
  console.log(
    `✓ No new unit-system branches (${findings.length} known, baseline ${baselineTotal}` +
      `${fixed > 0 ? `, ${fixed} fixed, run --update to shrink the baseline` : ''}).`,
  )
}

main()
