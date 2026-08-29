import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import * as ts from 'typescript'

/**
 * No binary unit API outlives its last production caller.
 *
 * ★ WHY THIS IS A TEST AND NOT A COMMENT. Plan 3b ruling R2 keeps
 * `utils/units.ts` and asks for a decision PER OCCURRENCE: migrate the
 * internals, or exempt with a stated reason. Sixteen of the units gate's 43
 * comparison occurrences live here, and they are not sixteen scattered
 * ternaries: each one is the body of exactly one static `UnitFormatter` method
 * whose parameter is a `UnitSystem`. So the decision per occurrence is really a
 * decision per method, and there are only two honest answers.
 *
 * A method with production callers is exempt for as long as it has them, and
 * the units gate already reports every one of those call sites under its
 * `formatter-binary` leg, so the migration is somebody's tracked work. A method
 * with NO production callers is not exempt: it is a loaded trap. `system` is
 * collapsed from VOLUME (spec D8, `useUnitPreference.ts:98`), so the next
 * developer who reaches for `UnitFormatter.formatTemperature(c, system)` gets
 * degrees Celsius for a `{volume:'L', temperature:'f'}` user, and neither gate
 * leg complains: the comparison is in here, not at their call site, and their
 * call site is a brand-new `formatter-binary` finding that only shows up as
 * baseline growth long after they wrote it.
 *
 * So the exemption carries a CONDITION, and this test is the condition. R1 asks
 * for exemptions that are structural rather than prose, because the gate's
 * `// units-exempt:` pragma accepts any reason-bearing comment
 * (`validate-units.ts:486`). The pragmas on the survivors say why; this says
 * when they expire. When task 6 migrates the last `formatDistance(km, system)`
 * call site, this test fails and the method has to go.
 *
 * ★ AST, NOT `grep`, and the difference is not theoretical. `TireList.tsx:410`
 * carries the comment "Through the adapter, not UnitFormatter.formatPressure",
 * and `unitAdapters.ts:171` says "`UnitFormatter.getTemperatureUnit` still
 * does". A text scan reads both as call sites and reports two dead methods as
 * live, which is this test failing open on exactly the two methods it exists to
 * catch. Property accesses come from the parser, so a mention in prose is not a
 * caller.
 */

const FRONTEND = resolve(__dirname, '../../..')
const SRC = resolve(FRONTEND, 'src')
const UNITS = resolve(SRC, 'utils/units.ts')

/** The class whose binary surface this test polices. */
const FORMATTER_CLASS = 'UnitFormatter'

/** The parameter annotation that makes a method a binary unit decision. */
const BINARY_SYSTEM_TYPE = 'UnitSystem'

/**
 * The runtime to re-run the gate under.
 *
 * `bun run test:run` makes `process.execPath` the bun binary, which is the one
 * CI uses; the bare name is the fallback for any other runner.
 */
const BUN = /(?:^|[\\/])bun(?:\.exe)?$/.test(process.execPath) ? process.execPath : 'bun'

/**
 * The same set, derived a second time by `scripts/validate-units.ts --derived`.
 *
 * ★ WHY PARITY AND NOT "DERIVE ONE FROM THE OTHER". This file walks the AST of
 * `units.ts` and so does `validate-units.ts:deriveBinaryFormatterMethods`, in a
 * different language, and two implementations of one rule with nothing tying
 * them together is the shape this workstream has spent twenty-two instances
 * learning to distrust. Consuming the gate's answer here would remove the
 * duplication but also the independence: a change that narrowed the GATE's
 * derivation would narrow this test in the same breath and nothing would say
 * so. Asserting they AGREE catches drift in either direction, which is the
 * property actually wanted, and the run costs 0.2 s.
 *
 * @returns The method names the gate derives, sorted.
 */
function gateDerivedMethods(): string[] {
  const out = execFileSync(BUN, ['run', 'scripts/validate-units.ts', '--derived'], {
    cwd: FRONTEND,
    encoding: 'utf-8',
  })
  const line = /^BINARY_FORMATTER_METHODS \((\d+)\): (.*)$/m.exec(out)
  if (line === null) {
    // A silent zero here would make the parity assertion vacuously true, which
    // is the failure this file exists one level down to prevent.
    throw new Error(`could not read the gate's derived set from:\n${out}`)
  }
  const names = line[2]
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
  if (names.length !== Number(line[1])) {
    throw new Error(`the gate said ${line[1]} methods and listed ${names.length}`)
  }
  return [...names].sort()
}

/**
 * Parse one file, refusing to report a file the parser choked on as clean.
 *
 * Same fail-loud posture as `scripts/validate-units.ts:scanSource`: a rejected
 * file yields no property accesses at all, which this test would otherwise read
 * as "nobody calls anything in here".
 */
function parse(path: string): ts.SourceFile {
  const text = readFileSync(path, 'utf-8')
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
  // `parseDiagnostics` is real but internal, so it is not on the public type.
  // Narrowed rather than cast to `any`, and absent is a HARD failure: a build
  // that exposes none would make a rejected file look like a clean one, which
  // is the same trap `validate-units.ts:loadTypeScript` refuses to walk into.
  const { parseDiagnostics } = source as ts.SourceFile & {
    parseDiagnostics?: readonly ts.Diagnostic[]
  }
  if (parseDiagnostics === undefined) {
    throw new Error('this TypeScript build exposes no parseDiagnostics; refusing to scan')
  }
  if (parseDiagnostics.length > 0) {
    throw new Error(`${relative(FRONTEND, path)}: ${parseDiagnostics.length} parse error(s)`)
  }
  return source
}

/** Every static `UnitFormatter` method that takes a binary `UnitSystem`. */
function binaryFormatterMethods(): string[] {
  const source = parse(UNITS)
  const found = new Set<string>()
  const walk = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name?.text === FORMATTER_CLASS) {
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue
        const isStatic = (member.modifiers ?? []).some(
          (m) => m.kind === ts.SyntaxKind.StaticKeyword
        )
        const takesSystem = member.parameters.some(
          (p) => p.type?.getText(source).trim() === BINARY_SYSTEM_TYPE
        )
        if (isStatic && takesSystem) found.add(member.name.getText(source))
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(source)
  return [...found].sort()
}

/**
 * Every production `.ts`/`.tsx` under `src/`, minus tests and units.ts itself.
 *
 * units.ts is excluded because a method calling a sibling on its own class is
 * not a production CALLER of the binary API: `formatVolumeTotal` delegating to
 * `formatVolumeShort` would keep a dead method looking alive.
 */
function productionSources(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        walk(path)
        continue
      }
      if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue
      if (path === UNITS) continue
      out.push(path)
    }
  }
  walk(SRC)
  return out
}

/** Files where `UnitFormatter.<method>` is actually accessed, by method. */
function callersByMethod(methods: string[]): Map<string, string[]> {
  const wanted = new Set(methods)
  const callers = new Map<string, string[]>(methods.map((m) => [m, []]))
  for (const path of productionSources()) {
    const source = parse(path)
    const walk = (node: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === FORMATTER_CLASS &&
        wanted.has(node.name.text)
      ) {
        const seen = callers.get(node.name.text)!
        const rel = relative(FRONTEND, path)
        if (!seen.includes(rel)) seen.push(rel)
      }
      ts.forEachChild(node, walk)
    }
    walk(source)
  }
  return callers
}

describe('the binary UnitFormatter surface', () => {
  it('derives the same set the units gate derives, in the other language', () => {
    // The gate's `formatter-binary` leg only reports call sites for methods in
    // ITS set. If the two derivations drift, one of them is reporting on a
    // surface the other cannot see, and neither would say so.
    expect(binaryFormatterMethods()).toEqual(gateDerivedMethods())
  })

  it('derives the binary methods from units.ts rather than listing them', () => {
    // A derivation that silently found nothing would make the real assertion
    // below vacuously true, so the count is pinned. Task 2 deleted the seven
    // that no production file called, leaving nine; task 3 moved
    // PropaneRecordForm onto the mass adapter, which retired `getWeightUnit`
    // and left these eight. Task 6 retires the rest, and each retirement
    // lowers this number.
    expect(binaryFormatterMethods()).toEqual([
      'formatCostPerDistance',
      'formatDistance',
      'formatFuelEconomy',
      'formatFuelRate',
      'getCostPerDistanceLabel',
      'getDistanceUnit',
      'getFuelEconomyUnit',
      'getFuelRateUnit',
    ])
  })

  it('keeps no binary method that no production file calls', () => {
    const callers = callersByMethod(binaryFormatterMethods())
    const dead = [...callers].filter(([, files]) => files.length === 0).map(([name]) => name)

    // Empty, and it has to stay empty. A binary method with no caller left is
    // not dead code to tidy up later: it is a `system` parameter waiting for
    // somebody to pass it a value collapsed from volume. Delete it, and reach
    // for `useUnitFormat()` / `makeUnitFormat()` instead.
    expect(dead).toEqual([])
  })
})
