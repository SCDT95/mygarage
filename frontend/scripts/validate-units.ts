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
 *   bun run scripts/validate-units.ts --src <dir>      # walk another tree (selftest)
 * Exit code: 1 when any key's occurrence count exceeds its baseline.
 */

import { createRequire } from 'module'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { ROOT } from './translation-utils'

/**
 * The real TypeScript compiler API, loaded the way Node's resolver would.
 *
 * ★ The precise hazard, because the first version of this comment described it
 * wrongly and a false rationale in a load-bearing comment is how the next
 * person deletes the guard. From inside `frontend/` a bare
 * `import ts from 'typescript'` resolves to the installed package and gives
 * 2248 keys, `createSourceFile` a function, version 6.0.3. Resolution follows
 * the importing file rather than the cwd, so that holds from any working
 * directory. What it does NOT survive is running with no `node_modules` tree
 * above the importing file at all: rather than failing, Bun answers the bare
 * specifier from its auto-install cache stub
 * (`~/.bun/install/cache/typescript@7.0.2@@@1/lib/version.cjs`), which exports
 * exactly `version` and `versionMajorMinor`. `createSourceFile` is then
 * `undefined` and every scan reports zero findings on a tree full of them.
 *
 * Both states were measured rather than assumed, because the first version of
 * this comment named the wrong trigger:
 *   - `node_modules` present, `typescript` missing from it: Bun throws
 *     MODULE_NOT_FOUND, so that state is loud on its own.
 *   - no `node_modules` at all (a CI job that skipped `bun install`, a script
 *     run from outside the tree): the stub answers, silently.
 * The second is not hypothetical. The Translations workflow deliberately
 * skipped `bun install` until this commit.
 *
 * ★ And the sting: the stub reports 7.0.2, NEWER than the installed 6.0.3, so
 * a version check would wave it through. Only an API check catches it. Hence
 * both halves below: resolve through the package's own `main` field rather
 * than the bare specifier, and assert the API before scanning anything.
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

interface TsDiagnostic {
  messageText: string | { messageText: string }
  start?: number
}

interface TsSourceFile extends TsNode {
  getLineAndCharacterOfPosition: (pos: number) => { line: number; character: number }
  /**
   * Internal to the compiler and absent from its public typings, which is why
   * it is optional here and why `scanSource` treats "the property is missing"
   * as a reason to refuse rather than as an empty list.
   */
  parseDiagnostics?: TsDiagnostic[]
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
 * Every string literal the unit-system union has ever contained.
 *
 * `'custom'` is in here because phase 1 widened the API-level preference union
 * to admit it, so `type Pref = 'imperial' | 'metric' | 'custom'` is a plausible
 * phase 3b artifact and it is unambiguously a unit-system type.
 */
const UNIT_VOCABULARY = new Set([
  "'imperial'",
  "'metric'",
  "'custom'",
  '"imperial"',
  '"metric"',
  '"custom"',
  // Backticks are the third spelling, and leaving them out was a FAIL-OPEN.
  // `type Sys = ` + '`imperial` | `metric`' + ` compiles clean under --strict and
  // scored zero findings, because STRING_LITERAL_TYPE below RECOGNISES a
  // backtick literal: the member was confidently classified `foreign` instead
  // of falling through to fail-closed `unknown`. The confident
  // misclassification was the bug, not the missing entry. One backtick member
  // was enough to exempt an otherwise correctly-spelled union.
  '`imperial`',
  '`metric`',
  '`custom`',
])

/**
 * Members that carry no value a unit comparison could be about.
 *
 * They are STRIPPED before the remaining members are judged, and that is the
 * whole of round 2's F2 regression: `'imperial' | 'metric' | null` was read as
 * "not every member is unit vocabulary, therefore foreign, therefore exempt",
 * and `UnitSystem | null` is this codebase's own `readStoredUnitSystem` return
 * type. A nullable unit system is a unit system.
 */
const NULLISH_MEMBERS = new Set(['null', 'undefined', 'void', 'never'])

/** A round-1 denylist of NAMES (`UnitSystem|string|any|unknown`) used to sit
 * here. It is gone, not moved: every one of those names is a bare identifier
 * that resolves to no local type alias, and an unresolvable identifier is
 * already classified UNKNOWN and refused an exemption. Keeping the list would
 * have been a guard no mutation could kill, which this phase has now twice
 * ruled is a survivor wearing a guard's name. Verified by corpus cases S-P9,
 * S-P11, S-P12, S-P23 and S-P24, all of which still fail without it. */

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
interface FileIndex {
  /** Declared name to every type annotation it is declared with, null when bare. */
  declared: Map<string, (string | null)[]>
  /** Local `type X = ...` aliases, so a named union can be resolved to members. */
  aliases: Map<string, string>
}

function indexDeclarations(source: TsSourceFile): FileIndex {
  const declared = new Map<string, (string | null)[]>()
  const aliases = new Map<string, string>()
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
    if (node.kind === ts.SyntaxKind.TypeAliasDeclaration && node.name && node.type) {
      aliases.set(node.name.text ?? '', node.type.getText(source))
    }
    ts.forEachChild(node, walk)
  }
  walk(source)
  return { declared, aliases }
}

/**
 * Strip balanced surrounding parentheses, repeatedly.
 *
 * `type Sys = ('imperial' | 'metric')` is one of the five shapes that walked
 * past round 2. Only a paren that closes at the very end is stripped, so
 * `(typeof SYSTEMS)[number]` keeps its shape and stays UNKNOWN rather than
 * being mangled into something that looks resolvable.
 */
function stripOuterParens(text: string): string {
  let out = text.trim()
  while (out.startsWith('(') && out.endsWith(')')) {
    let depth = 0
    let balanced = true
    for (let i = 0; i < out.length; i += 1) {
      if (out[i] === '(') depth += 1
      else if (out[i] === ')') {
        depth -= 1
        if (depth === 0 && i !== out.length - 1) balanced = false
      }
    }
    if (!balanced || depth !== 0) break
    out = out.slice(1, -1).trim()
  }
  return out
}

/**
 * Split a union on TOP-LEVEL `|` only.
 *
 * A naive `text.split('|')` tears `Record<string, 'a' | 'b'>` in half and then
 * judges the halves, so the nesting depth is tracked through `<`, `(`, `[`, `{`
 * and both quote styles.
 */
function splitUnion(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let current = ''
  for (const ch of text) {
    if (quote) {
      current += ch
      if (ch === quote) quote = ''
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      current += ch
      continue
    }
    if ('<([{'.includes(ch)) depth += 1
    else if ('>)]}'.includes(ch)) depth -= 1
    if (ch === '|' && depth <= 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)
  return parts.map((s) => s.trim()).filter((s) => s.length > 0)
}

/**
 * What one type expression is, as far as this gate can tell.
 *
 * `unknown` is the fail-closed class and it is doing most of the work: an
 * imported alias, `(typeof SYSTEMS)[number]`, a generic, or the bare word
 * `string` all land here, and none of them earns an exemption.
 */
type MemberClass = 'unit' | 'foreign' | 'nullish' | 'unknown'

const STRING_LITERAL_TYPE = /^(?:'[^']*'|"[^"]*"|`[^`]*`|-?\d+(?:\.\d+)?|true|false)$/
const BARE_IDENTIFIER = /^[A-Za-z_$][\w$]*$/

function classifyMember(
  member: string,
  aliases: Map<string, string>,
  depth: number,
): MemberClass {
  const m = stripOuterParens(member)
  if (UNIT_VOCABULARY.has(m)) return 'unit'
  if (NULLISH_MEMBERS.has(m)) return 'nullish'
  if (STRING_LITERAL_TYPE.test(m)) return 'foreign'
  if (BARE_IDENTIFIER.test(m)) {
    const body = aliases.get(m)
    // Fail-closed on a name this file does not declare, and on an alias cycle.
    if (body === undefined || depth >= 8) return 'unknown'
    return classifyAnnotation(body, aliases, depth + 1)
  }
  return 'unknown'
}

/**
 * Classify a whole annotation by classifying its members INDIVIDUALLY.
 *
 * ★ Round 2 judged the annotation's whole text and asked "are all members unit
 * vocabulary?", so a single member outside the vocabulary made the entire
 * annotation foreign, and foreign means exempt. Five shapes walked past,
 * including `'imperial' | 'metric' | null`, which round 1 had caught. Deciding
 * per member is the fix.
 *
 * The order of the three tests below is the whole rule:
 *
 *  1. any UNKNOWN member and the annotation earns nothing. That is what stops
 *     an imported alias, an indexed access, or the bare word `string` being a
 *     rename away from silence;
 *  2. nullish members are dropped, because a nullable unit system is a unit
 *     system;
 *  3. of what remains, a member that is a literal OUTSIDE the vocabulary makes
 *     the annotation foreign.
 *
 * ★ Test 3 is a DELIBERATE divergence from the reviewer's wording, which was
 * "foreign only when NO member is a unit system". Taken literally that flags
 * `type Theme = 'light' | 'dark' | 'imperial'`, and R2 requires that case to be
 * ACCEPTED while R3 names it as the case this whole leg exists to distinguish.
 * A type carrying members no unit system has ever contained is a different enum
 * that happens to share a spelling.
 *
 * ★ WHERE THAT BOUNDARY SITS, because it is wider than the Theme case and the
 * next reader should not have to discover it: ANY recognised literal outside
 * the vocabulary exempts the union, so `'imperial' | 'metric' | 0` is exempt
 * too. That is the rounding working as designed rather than a second bypass:
 * `0` is a literal type this scanner can read and no unit system has ever
 * contained, so the union is treated as a different enum. The rule is
 * "recognised non-vocabulary literal means foreign", not "string literal means
 * foreign", and a member it CANNOT read is `unknown` and fail-closed instead.
 * If that ever needs to change, change it here and expect S-N2 and S-N6 to
 * flip, which is what `M38-any-unit-member-flags` measures. Every probe in the review's bypass table is
 * still closed, and the control still fires; only Theme differs, and Theme is
 * the corpus negative. Pinned from the other side by `M38-any-unit-member-flags`,
 * which implements the literal reading and flips exactly that case.
 */
function classifyAnnotation(
  text: string,
  aliases: Map<string, string>,
  depth = 0,
): MemberClass {
  const members = splitUnion(stripOuterParens(text))
  if (members.length === 0) return 'unknown'
  const classes = members.map((m) => classifyMember(m, aliases, depth))
  if (classes.includes('unknown')) return 'unknown'
  const significant = classes.filter((c) => c !== 'nullish')
  if (significant.length === 0) return 'nullish'
  if (significant.includes('foreign')) return 'foreign'
  return 'unit'
}

/** True when an annotation proves the operand is NOT a unit system. */
function isForeignAnnotation(annotation: string, aliases: Map<string, string>): boolean {
  const verdict = classifyAnnotation(annotation, aliases)
  return verdict === 'foreign' || verdict === 'nullish'
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
function hasForeignProvenance(operand: TsNode, index: FileIndex): boolean {
  if (operand.kind !== ts.SyntaxKind.Identifier) return false
  const annotations = index.declared.get(operand.text ?? '')
  if (annotations === undefined || annotations.length === 0) return false
  return annotations.every((a) => a !== null && isForeignAnnotation(a, index.aliases))
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

/**
 * The escape hatch, and it must carry a reason.
 *
 * Round 1 tested `line.includes('units-exempt')`, so a bare marker with no
 * justification silenced a finding while the docstring and the failure message
 * both promised "with the reason". Requiring the comment introducer and a
 * colon also stops the marker matching inside an ordinary string literal.
 */
const EXEMPT_PRAGMA = /(?:^|\s)\/\/\s*units-exempt:\s*\S/

/**
 * A source file thrown away by the parser is worse than a missing gate.
 *
 * Round 1 hardcoded `ScriptKind.TSX` for every file. `const x = <string>raw` is
 * an angle-bracket type assertion: legal TypeScript in a `.ts` file, illegal in
 * TSX. Under the wrong ScriptKind the parser dropped the enclosing subtree, the
 * scan returned nothing for the file, the gate exited 0, and it printed
 * "3 fixed, run --update to shrink the baseline", inviting the blindness to be
 * baked into the baseline. Two halves to the fix and both are needed: choose
 * the ScriptKind by extension, and REFUSE TO SCAN a file the parser complained
 * about, rather than reporting the wreckage as a clean file. Same fail-loud
 * posture as `loadTypeScript`, one layer in.
 */
export function scanSource(source: string, rel: string): Finding[] {
  const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, kind)
  const diagnostics = sf.parseDiagnostics
  if (diagnostics === undefined) {
    throw new Error(
      `${rel}: this TypeScript build exposes no parseDiagnostics, so a file the ` +
        'parser rejected would be indistinguishable from a clean one. Refusing to scan.',
    )
  }
  if (diagnostics.length > 0) {
    const first = diagnostics[0]
    const message =
      typeof first.messageText === 'string' ? first.messageText : first.messageText.messageText
    const at =
      first.start === undefined
        ? ''
        : ` (line ${sf.getLineAndCharacterOfPosition(first.start).line + 1})`
    throw new Error(
      `${rel}: parsed as ${rel.endsWith('.tsx') ? 'TSX' : 'TS'} with ` +
        `${diagnostics.length} parse error(s)${at}: ${message}\n` +
        'A file the parser rejects yields zero findings, which this gate would ' +
        'otherwise report as migration progress. Fix the file, or fix the gate.',
    )
  }
  const lines = source.split('\n')
  const index = indexDeclarations(sf)
  const findings: Finding[] = []

  const record = (node: TsNode, kind_: string, text: string): void => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
    // Escape hatch: the offending line or the line directly above it.
    if (EXEMPT_PRAGMA.test(lines[line - 1] ?? '') || EXEMPT_PRAGMA.test(lines[line - 2] ?? '')) {
      return
    }
    findings.push({ file: rel, line, kind: kind_, text })
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
          if (!hasForeignProvenance(operand, index) && !isPlaceholderAttribute(node)) {
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

  // `--src` exists so the selftest can walk a fixture tree it owns instead of
  // this repo's `src`. Round 1's probes wrote fixtures INTO `src`, where an
  // interrupted run left a file that failed validate-reachability.ts. A gate
  // whose own tests can break the working tree is not one anybody will wire
  // into CI, so the directory is a parameter.
  const srcIdx = argv.indexOf('--src')
  const srcDir = srcIdx === -1 ? SRC_DIR : (argv[srcIdx + 1] ?? SRC_DIR)

  const findings = walkDir(srcDir).flatMap(scanFile)
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
