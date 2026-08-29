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
 * (`EXEMPT_PRAGMA` in `validate-units.ts`). The pragmas on the survivors say why; this says
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
const DECIMAL_SAFE = resolve(SRC, 'utils/decimalSafe.ts')

/** The class whose binary surface this test polices. */
const FORMATTER_CLASS = 'UnitFormatter'

/** The parameter annotation that makes a method a binary unit decision. */
const BINARY_SYSTEM_TYPE = 'UnitSystem'

/**
 * Whether one declaration decides on a binary `UnitSystem`.
 *
 * ★ Shared by the formatter walk and the conversion walk ON PURPOSE, and that
 * sharing is what keeps the conversion assertion from going vacuous. The
 * conversion surface is asserted EMPTY below, and an empty result has two
 * causes: the helpers are gone (the intended one), or this predicate stopped
 * matching anything at all because `UnitSystem` was renamed. The formatter
 * block pins a set of eight through this same function, so a predicate that
 * matched nothing would fail there first, loudly, with a name to look at.
 */
function takesBinarySystem(
  node: { parameters?: ts.NodeArray<ts.ParameterDeclaration> },
  source: ts.SourceFile
): boolean {
  return (node.parameters ?? []).some(
    (p) => p.type?.getText(source).trim() === BINARY_SYSTEM_TYPE
  )
}

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
function gateDerivedSet(label: string): string[] {
  const out = execFileSync(BUN, ['run', 'scripts/validate-units.ts', '--derived'], {
    cwd: FRONTEND,
    encoding: 'utf-8',
  })
  const line = new RegExp(`^${label} \\((\\d+)\\): (.*)$`, 'm').exec(out)
  if (line === null) {
    // A silent zero here would make the parity assertion vacuously true, which
    // is the failure this file exists one level down to prevent. It also covers
    // the empty conversion set: the gate prints `(0): ` and that line still has
    // to BE THERE, so a gate that stopped deriving the set at all is not
    // mistaken for one that derived it and found nothing.
    throw new Error(`could not read the gate's ${label} from:\n${out}`)
  }
  const names = line[2]
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
  if (names.length !== Number(line[1])) {
    throw new Error(`the gate said ${line[1]} ${label} and listed ${names.length}`)
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

/**
 * `UnitFormatter`'s static methods, split by shape.
 *
 * ★ Both halves are returned because the interesting assertion is now that
 * `binary` is EMPTY, and "empty" is only evidence if the walk was looking.
 * `statics` is the walk's own receipt, exactly as `exported` is for the
 * conversion surface below: a walk that had silently stopped visiting the class
 * returns two empty sets, and the test that pins `statics` fails first with a
 * name to look at. Until task 7 the pinned list of two binary methods played
 * that role; retiring them took the receipt with it, so the replacement lands
 * in the same change rather than on the day somebody notices.
 */
function formatterMethods(): { binary: string[]; statics: string[] } {
  const source = parse(UNITS)
  const binary = new Set<string>()
  const statics = new Set<string>()
  const walk = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name?.text === FORMATTER_CLASS) {
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue
        const isStatic = (member.modifiers ?? []).some(
          (m) => m.kind === ts.SyntaxKind.StaticKeyword
        )
        if (!isStatic) continue
        statics.add(member.name.getText(source))
        if (takesBinarySystem(member, source)) binary.add(member.name.getText(source))
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(source)
  return { binary: [...binary].sort(), statics: [...statics].sort() }
}

/**
 * The exported function declarations of `decimalSafe.ts`, split by shape.
 *
 * ★ Both halves are returned because the interesting assertion is that `binary`
 * is EMPTY, and "empty" is only evidence if the walk was looking. `exported`
 * is the walk's own receipt: it holds the helpers that survived R8, so a walk
 * that had silently stopped visiting the file returns two empty sets and the
 * test that pins `exported` fails first.
 *
 * @returns The binary helpers, and every exported function declaration seen.
 */
function conversionHelpers(): { binary: string[]; exported: string[] } {
  const source = parse(DECIMAL_SAFE)
  const binary = new Set<string>()
  const exported = new Set<string>()
  const walk = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name !== undefined &&
      (node.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      exported.add(node.name.getText(source))
      if (takesBinarySystem(node, source)) binary.add(node.name.getText(source))
    }
    ts.forEachChild(node, walk)
  }
  walk(source)
  return { binary: [...binary].sort(), exported: [...exported].sort() }
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
    // surface the other cannot see, and neither would say so. This matters most
    // now that the set is EMPTY: `gateDerivedSet` throws when the gate does not
    // print the line at all, so a gate that stopped deriving the set is not
    // mistaken for one that derived it and found nothing.
    expect(formatterMethods().binary).toEqual(gateDerivedSet('BINARY_FORMATTER_METHODS'))
  })

  it('still reads the static methods, so the empty set below means something', () => {
    // The receipt. Task 2 deleted the seven binary methods that no production
    // file called, leaving nine; task 3 moved PropaneRecordForm onto the mass
    // adapter, which retired `getWeightUnit`; task 6 migrated the twenty-seven
    // call sites of `formatDistance` and `getDistanceUnit`; task 6b the
    // thirty-one of the fuel-economy and fuel-rate family; task 7 the five of
    // `formatCostPerDistance` and `getCostPerDistanceLabel`. Each time this
    // file failed FIRST and the methods followed.
    //
    // What survives on the class is the resolved-set surface, and pinning it is
    // what stops the assertion after this one going vacuous.
    // ★ TWO NAMES LEFT THIS LIST IN FIX ROUND 1, and how they were found is the
    // point. `formatVolumeTotal` and `getCostPerVolumeLabel` each glued an
    // ENGLISH WORD to a unit symbol and rendered in summary cards with no
    // `t()`, so task 7 translated the cost-per-distance caption one card to the
    // right of an untranslated one. The receipt below is where a reader could
    // have seen them: it enumerates this class's whole surviving surface by
    // name, which is what a receipt is for. Every name left returns a number, a
    // currency string or a bare unit symbol; none returns prose.
    expect(formatterMethods().statics).toEqual([
      'formatCostPerVolume',
      'formatVolume',
      'formatVolumeShort',
      'getMassUnit',
      'getVolumeUnit',
    ])
  })

  it('★ declares no binary method at all, and keeps none a production file cannot call', () => {
    const { binary } = formatterMethods()
    // ★ EMPTY IS THE GOAL STATE, reached by task 7. Every method on this class
    // now takes the resolved `UnitSet`. A `UnitSystem` parameter added back
    // here fails this line one step before a call site can exist, and the units
    // gate picks its call sites up on the next run without anybody widening a
    // list.
    expect(binary).toEqual([])

    // And the rule that emptied it, kept live for whatever is added next: a
    // binary method with no caller left is not dead code to tidy up later, it
    // is a `system` parameter waiting for somebody to pass it a value collapsed
    // from volume. Delete it, and reach for `useUnitFormat()` /
    // `makeUnitFormat()` instead.
    const callers = callersByMethod(binary)
    const dead = [...callers].filter(([, files]) => files.length === 0).map(([name]) => name)
    expect(dead).toEqual([])
  })
})

describe('the binary conversion surface', () => {
  it('derives the same set the units gate derives, in the other language', () => {
    // Same parity argument as the formatter block: two AST walks of one rule in
    // two languages, asserted to agree rather than one consuming the other.
    // This is the leg that matters most while the set is empty, because an
    // empty vocabulary is exactly the state in which a detector reports nothing
    // and looks healthy doing it.
    expect(conversionHelpers().binary).toEqual(gateDerivedSet('BINARY_CONVERSION_HELPERS'))
  })

  it('still reads the exported helpers, so the empty set below means something', () => {
    // The receipt. This list is what a healthy walk over this file sees; if it
    // ever comes back empty, the assertion after it proves nothing at all.
    //
    // ★ IT MOVED IN PLAN 3b TASK 7, AND WHAT MOVED IS A SECOND DEFECT CLASS ON
    // THE SAME FILE. `toCanonicalLiters` and `priceToCanonical` were the two
    // exports that converted a DISPLAY value straight to canonical. That is
    // correct for a field the user edited and is the entry-grid shift (ruling
    // R4) for one they did not: the field had been seeded with a rounded
    // display and the submit reconverted the rounding, moving 16 of 27 measured
    // price combinations and 13 of 27 volume ones. Neither is exported now.
    // Volume goes through the quantity protocol plus `toLitersWirePrecision`,
    // which rounds and does not convert; price goes through `seedPriceField` /
    // `canonicalFromPriceField`, the price mirror of that protocol, behind
    // which the old converter is module-private.
    expect(conversionHelpers().exported).toEqual([
      'canonicalFromPriceField',
      'priceToDisplay',
      'readNumber',
      'seedPriceField',
      'toLitersWirePrecision',
    ])
  })

  it('exports no conversion helper that writes canonical values off a collapsed system', () => {
    // ★ Ruling R8, and the phase's signature defect in its final form.
    // `toCanonicalKm(value, system)` had no numeric literal and no
    // `UnitFormatter` call at its call site, so the units gate's original two
    // legs were blind to the function WRITING the wrong number: a
    // `{volume:'L', distance:'mi'}` user collapses to `system === 'metric'`,
    // and 500 miles was stored as 500 km instead of 804.67.
    //
    // R8 offered detection or deletion. Task 5 took deletion, because deletion
    // makes the bad call inexpressible rather than merely reported, and this is
    // the assertion that keeps it deleted: re-adding `toCanonicalKm`,
    // `toCanonicalKg`, `toCanonicalMeters` or a `toCanonicalFathoms` nobody has
    // thought of yet fails here on the DECLARATION, one step before a call site
    // can exist.
    //
    // The replacement is the origin-preserving pair in `utils/unitFormat.ts`:
    // `seedUnitField(canonical, quantity)` and
    // `canonicalFromUnitField(typed, origin, quantity)`. `toCanonicalLiters`
    // survives in the same file and is not an oversight: it takes the resolved
    // `UnitSet`, which is the correct shape.
    expect(conversionHelpers().binary).toEqual([])
  })
})
