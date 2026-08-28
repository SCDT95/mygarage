#!/usr/bin/env bun
/**
 * The unit-audit manifest: a REVIEWED SNAPSHOT, digest-pinned, over a STATED
 * universe (plan 2026-08-28-units-phase3b, ruling R9).
 *
 * ★ WHAT THIS IS NOT, first, because five plan revisions got it wrong.
 *
 * This is NOT a completeness check and it cannot become one. The unit defects
 * in this codebase have no common lexical form: `formatVolume(units)` is
 * correct and `formatVolumePerDistance(units)` derives its distance half from
 * `units.volume`, and the two are CALL-SITE IDENTICAL; the fuel receipt preview
 * is an ordinary template string. Three separate revisions of the plan claimed a
 * mechanical artifact could certify their absence, and the claimed boundary
 * relocated three times before the answer turned out to be "stop claiming it".
 *
 * The exact sentence this file supports, and no stronger one:
 *
 *   all mechanically enumerated modules were dispositioned at this reviewed
 *   snapshot; these named scenarios pass
 *
 * ★ AND THE LIMIT OF THE DIGEST, stated here rather than in a plan nobody
 * reads at 3am. Binding a disposition to a content digest closes exactly one
 * hole: a name-set manifest cannot see unit behaviour ADDED to a module already
 * dispositioned `no unit behaviour`. Drop `` `${draft.liters} L` `` into such a
 * file and no parity check fires, because the name set did not change. With a
 * digest, that edit fails CI until somebody re-dispositions the row.
 *
 * A DIGEST FORCES EXPLICIT RE-ACKNOWLEDGEMENT. IT CANNOT PROVE THE QUALITY OF
 * THE REVIEW IT FORCES. `--update` will happily re-stamp every row in the file,
 * and no gate can tell a careful re-read from a keystroke. That is a real limit,
 * not a caveat: what this buys is that the re-acknowledgement is EXPLICIT and
 * appears in the diff, not that it is honest.
 *
 * ★ THE UNIVERSE IS STATED, NOT INFERRED. `validate-reachability.ts` walks
 * textual imports from `src/main.tsx`, so it cannot see the document that loads
 * `src/main.tsx`, nor anything served rather than imported:
 *
 *   - `index.html`, the entry document;
 *   - the service worker, registered by URL (`main.tsx`);
 *   - the non-English locale resources, loaded by HTTP URL template (`i18n.ts`);
 *   - `offline.html` and `manifest.json`, which `sw.js` precaches by name.
 *
 * The locale bundles are not academic. The settings screen tells a
 * `{volume:'L', distance:'mi', pressure:'psi'}` user "Using metric units:
 * liters, kilometers, L/100km, °C, bar, kg, Nm" in SIX languages, and nothing
 * in the walker would have said those files existed.
 *
 * So the universe is: every file `validate-reachability.ts` recognises, PLUS the
 * entry document, PLUS everything shipped under `public/`. Anything outside that
 * is out of scope BY STATEMENT rather than by accident. `walkGraph` is imported
 * from that gate rather than reimplemented here, because two copies of a walk
 * are two answers to "what is the universe" the first time one of them changes.
 *
 * Usage:
 *   bun run scripts/validate-units-manifest.ts              # gate
 *   bun run scripts/validate-units-manifest.ts --update     # re-stamp digests
 *   bun run scripts/validate-units-manifest.ts --report     # disposition summary
 *   bun run scripts/validate-units-manifest.ts --root <dir> # another tree (selftest)
 *   bun run scripts/validate-units-manifest.ts --manifest <p>
 * Exit code: 1 on any parity, schema or digest failure.
 */

import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, relative, sep } from 'path'
import { ROOT } from './translation-utils'
import { walkGraph } from './validate-reachability'

const DEFAULT_MANIFEST = join(ROOT, 'scripts', 'units.manifest.json')

/**
 * Runtime roots the import walker cannot reach.
 *
 * ★ THE RULE HAS NO SEMANTIC STEP, AND THAT IS THE SECOND REVISION OF IT.
 * The first version named `public/sw.js` and enumerated `public/locales`, which
 * is what R9 described. A review then found the universe was itself a floor in
 * the shape of the previous nineteen: `index.html`, `public/offline.html` and
 * `public/manifest.json` are all shipped and user-facing, `sw.js` precaches two
 * of them by name, and none of the three was in scope. No unit text in them
 * today, so no live defect, but they were out by OMISSION rather than by
 * statement, and that distinction is the whole of R9's closing sentence.
 *
 * So the rule is now mechanical: the entry document, plus EVERY file under
 * `public/`, with no extension filter. That deliberately includes the two PNG
 * icons. Filtering to "files that can carry text" would put a judgement back in
 * the middle of the universe, and a judgement is the thing that relocates: an
 * SVG carries text, a JSON does, a `.txt` does, and the next person's list will
 * not match this one's. A binary asset costs one cheap re-acknowledgement on the
 * rare day it changes, which is a better trade than a filter nobody can audit.
 */
const ENTRY_DOCUMENT = 'index.html'
const PUBLIC_DIR = 'public'

/**
 * Who repairs a recorded finding. An ENUM, not free text.
 *
 * The first version of this manifest put the owner inside the finding string,
 * and 47 rows produced twelve different spellings of it ("task 6", "tasks 4, 6
 * and 7", "task 2 (R1 composition)", "task 6, jointly with ..."). Tasks 2
 * through 7 consume this list as their work list, so a spelling nobody greps
 * for is an orphaned work item, and prose cannot be checked.
 *
 * `deferred` is a real member rather than an escape hatch: some recorded
 * observations are genuinely outside this phase, and a row that says so
 * explicitly is better than one that invents an owner to satisfy a schema.
 */
const OWNERS = new Set([
  'task 2',
  'task 3',
  'task 4',
  'task 5',
  'task 6',
  'task 7',
  'task 8',
  'task 9',
  'phase 4',
  'deferred',
])

/** The dispositions a row may carry. Anything else fails. */
const DISPOSITIONS = new Set([
  /** Reviewed; unit behaviour present. Carries `tests`, `findings`, or both. */
  'audited',
  /** Reviewed; the module makes no unit decision and renders no unit-bearing quantity. */
  'no unit behaviour',
  /** Unit behaviour present and deliberately outside the conversion contract. */
  'domain exemption',
  /** Reviewed; correctness cannot be established at this layer. `reason` says what would settle it. */
  'unverifiable',
])

interface ManifestRow {
  path: string
  disposition: string
  digest: string
  reason?: string
  tests?: string[]
  findings?: string[]
  owners?: string[]
}

/**
 * One failure, tagged so a caller can assert WHICH check fired.
 *
 * The tags are load bearing for this gate's own mutation tests. R9 requires the
 * "edit a `no unit behaviour` module" mutation to fail SPECIFICALLY on the
 * digest mismatch rather than incidentally, and a bare exit code cannot tell
 * those apart: a checker that reported "something is wrong" would pass that
 * mutation test while checking the wrong thing.
 */
type Tag = 'unlisted' | 'orphan' | 'duplicate' | 'schema' | 'digest'

interface Failure {
  tag: Tag
  path: string
  detail: string
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** POSIX-style relative path, so a manifest is the same on every platform. */
function rel(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join('/')
}

/** Every file shipped under `public/`, recursively. No filter, by design. */
function shippedPublicFiles(root: string): string[] {
  const base = join(root, PUBLIC_DIR)
  if (!existsSync(base)) {
    throw new Error(
      `${PUBLIC_DIR}/ does not exist under ${root}. Everything shipped there is a ` +
        'named part of this manifest\'s universe, and a universe that silently loses ' +
        'a part is the failure this file exists to prevent. Refusing to run.',
    )
  }
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else out.push(rel(root, full))
    }
  }
  walk(base)
  if (out.length === 0) {
    throw new Error(`nothing found under ${PUBLIC_DIR}/. See above: refusing to run.`)
  }
  return out
}

/** The stated universe: walker-recognised files plus the named runtime roots. */
export function universeOf(root: string): string[] {
  const walker = [...walkGraph(root)].map((f) => rel(root, f))
  if (walker.length === 0) {
    throw new Error(
      `the reachability walker recognised nothing under ${root}. Every row would ` +
        'read as an orphan and an empty manifest would pass. Refusing to run.',
    )
  }
  if (!existsSync(join(root, ENTRY_DOCUMENT))) {
    throw new Error(
      `${ENTRY_DOCUMENT} is missing. It is the document that loads the module graph, ` +
        'so the walker starts one level below it and can never see it, and dropping ' +
        'it here would shrink the universe silently. Refusing to run.',
    )
  }
  return [
    ...new Set([...walker, ENTRY_DOCUMENT, ...shippedPublicFiles(root)]),
  ].sort()
}

function loadManifest(path: string): ManifestRow[] {
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch {
    throw new Error(`units manifest missing at ${path}. Run --update to seed it.`)
  }
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`${path} is not a JSON array of rows.`)
  }
  return parsed as ManifestRow[]
}

/**
 * Everything wrong with the manifest, as tagged failures.
 *
 * Deliberately returns ALL of them rather than the first: this gate's own
 * mutation tests assert on the exact SET of tags that fired, and a checker that
 * short-circuits on the first problem cannot distinguish "the digest caught it"
 * from "parity caught it and the digest was never reached".
 */
export function checkManifest(root: string, rows: ManifestRow[]): Failure[] {
  const failures: Failure[] = []

  const seen = new Set<string>()
  for (const row of rows) {
    if (typeof row?.path !== 'string' || row.path.length === 0) {
      failures.push({ tag: 'schema', path: '<row>', detail: 'row has no `path`' })
      continue
    }
    if (seen.has(row.path)) {
      failures.push({
        tag: 'duplicate',
        path: row.path,
        detail: 'listed more than once, so one row\'s disposition hides the other',
      })
    }
    seen.add(row.path)
  }

  const universe = new Set(universeOf(root))
  for (const path of [...universe].sort()) {
    if (!seen.has(path)) {
      failures.push({
        tag: 'unlisted',
        path,
        detail: 'in the universe but not dispositioned',
      })
    }
  }
  for (const path of [...seen].sort()) {
    if (!universe.has(path)) {
      failures.push({
        tag: 'orphan',
        path,
        detail: 'dispositioned but no longer in the universe',
      })
    }
  }

  for (const row of rows) {
    if (typeof row?.path !== 'string' || row.path.length === 0) continue
    const where = row.path
    if (!DISPOSITIONS.has(row.disposition)) {
      failures.push({
        tag: 'schema',
        path: where,
        detail: `disposition ${JSON.stringify(row.disposition)} is not one of ${[...DISPOSITIONS].join(', ')}`,
      })
    }
    const reason = (row.reason ?? '').trim()
    const tests = row.tests ?? []
    const findings = row.findings ?? []
    const owners = row.owners ?? []
    // A finding with no owner is a work item nobody is holding; an owner with no
    // finding is a name attached to no work. Both directions, because only
    // checking one of them leaves the other free.
    if (findings.length > 0 && owners.length === 0) {
      failures.push({
        tag: 'schema',
        path: where,
        detail: 'records findings but names no owner, so nothing holds the work item',
      })
    }
    if (owners.length > 0 && findings.length === 0) {
      failures.push({
        tag: 'schema',
        path: where,
        detail: 'names an owner but records no finding for them to repair',
      })
    }
    for (const owner of owners) {
      if (!OWNERS.has(owner)) {
        failures.push({
          tag: 'schema',
          path: where,
          detail:
            `owner ${JSON.stringify(owner)} is not one of ${[...OWNERS].join(', ')}. ` +
            'Free-text owners produced twelve spellings across 47 rows, and a spelling ' +
            'nobody greps for is an orphaned work item.',
        })
      }
    }
    if ((row.disposition === 'domain exemption' || row.disposition === 'unverifiable') && !reason) {
      failures.push({
        tag: 'schema',
        path: where,
        detail:
          row.disposition === 'unverifiable'
            ? 'unverifiable rows must state what would MAKE them verifiable'
            : 'a domain exemption must state the reason it is exempt',
      })
    }
    if (row.disposition === 'audited' && tests.length === 0 && findings.length === 0) {
      failures.push({
        tag: 'schema',
        path: where,
        detail:
          'an audited row must name the tests that cover it or the findings still ' +
          'open against it. A bare "audited" is an assertion nothing can fail.',
      })
    }
    // ★ A test id that names no file is the QUIET failure mode, and this repo
    // has already learned it once: `units_gate_selftest.py`'s scope proof
    // checks the same thing about ESLint exemption paths, because "a typo that
    // silently un-exempts a file fails loudly; a typo that names nothing at all
    // is the quiet one". An `audited` row is allowed to rest on `tests`, so a
    // `tests` entry pointing at a renamed or deleted file is a row resting on
    // nothing while still reading as covered.
    for (const test of tests) {
      if (!existsSync(join(root, 'src', test))) {
        failures.push({
          tag: 'schema',
          path: where,
          detail:
            `names a test that does not exist: src/${test}. A row that rests on a ` +
            'test id nobody can run is a row resting on nothing.',
        })
      }
    }
    if (row.disposition === 'no unit behaviour' && findings.length > 0) {
      failures.push({
        tag: 'schema',
        path: where,
        detail: 'a row with no unit behaviour cannot also record a unit finding',
      })
    }
    if (!universe.has(where)) continue
    const actual = sha256(join(root, where))
    if (row.digest !== actual) {
      failures.push({
        tag: 'digest',
        path: where,
        detail:
          `digest ${String(row.digest).slice(0, 12)} recorded, ${actual.slice(0, 12)} on disk. ` +
          `Re-review this file and re-stamp it: its disposition (${row.disposition}) was ` +
          'made against different content.',
      })
    }
  }

  return failures
}

function seed(root: string, rows: ManifestRow[]): ManifestRow[] {
  const byPath = new Map(rows.map((r) => [r.path, r]))
  return universeOf(root).map((path) => {
    const existing = byPath.get(path)
    const row: ManifestRow = {
      path,
      // A NEW file gets an empty disposition on purpose. `--update` re-stamps
      // digests, which is a re-acknowledgement a human can at least be asked
      // about; it must never INVENT a disposition, or seeding the manifest
      // would be the same keystroke as auditing the tree.
      disposition: existing?.disposition ?? '',
      digest: sha256(join(root, path)),
    }
    if (existing?.reason) row.reason = existing.reason
    if (existing?.tests?.length) row.tests = existing.tests
    if (existing?.findings?.length) row.findings = existing.findings
    return row
  })
}

function report(rows: ManifestRow[]): void {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.disposition, (counts.get(r.disposition) ?? 0) + 1)
  console.log(`\n${rows.length} row(s) in the unit-audit manifest:\n`)
  for (const [disposition, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${disposition || '<undispositioned>'}`)
  }
  const open = rows.filter((r) => (r.findings ?? []).length > 0)
  console.log(`\n${open.length} row(s) carrying recorded findings:\n`)
  for (const r of open.sort((a, b) => a.path.localeCompare(b.path))) {
    console.log(`  ${r.path}`)
    for (const f of r.findings ?? []) console.log(`      ${f}`)
  }
  const unverifiable = rows.filter((r) => r.disposition === 'unverifiable')
  console.log(`\n${unverifiable.length} unverifiable row(s):\n`)
  for (const r of unverifiable.sort((a, b) => a.path.localeCompare(b.path))) {
    console.log(`  ${r.path}\n      ${r.reason ?? ''}`)
  }
  console.log('')
}

function main(): void {
  const argv = process.argv.slice(2)
  const args = new Set(argv)
  const rootIdx = argv.indexOf('--root')
  const root = rootIdx === -1 ? ROOT : (argv[rootIdx + 1] ?? ROOT)
  const manifestIdx = argv.indexOf('--manifest')
  const manifestPath =
    manifestIdx === -1 ? DEFAULT_MANIFEST : (argv[manifestIdx + 1] ?? DEFAULT_MANIFEST)

  if (args.has('--update')) {
    let existing: ManifestRow[]
    try {
      existing = loadManifest(manifestPath)
    } catch {
      // No manifest yet, or an unreadable one. Seeding from nothing is the
      // bootstrap case; every row it writes is undispositioned and fails.
      existing = []
    }
    const before = new Map(existing.map((r) => [r.path, r.digest]))
    const rows = seed(root, existing)
    writeFileSync(manifestPath, `${JSON.stringify(rows, null, 1)}\n`)
    const restamped = rows.filter((r) => before.has(r.path) && before.get(r.path) !== r.digest)
    const added = rows.filter((r) => !before.has(r.path))
    console.log(`✓ units manifest written: ${rows.length} row(s)`)
    if (added.length > 0) {
      console.log(`  ${added.length} new row(s), each UNDISPOSITIONED and failing until reviewed:`)
      for (const r of added) console.log(`      ${r.path}`)
    }
    if (restamped.length > 0) {
      console.log(
        `  ${restamped.length} digest(s) re-stamped. Each one is a claim that you ` +
          're-read the file and the disposition still holds:',
      )
      for (const r of restamped) console.log(`      ${r.path}`)
    }
    return
  }

  const rows = loadManifest(manifestPath)
  if (args.has('--report')) report(rows)
  const failures = checkManifest(root, rows)

  if (failures.length > 0) {
    const byTag = new Map<Tag, Failure[]>()
    for (const f of failures) byTag.set(f.tag, [...(byTag.get(f.tag) ?? []), f])
    console.error(`\n✗ ${failures.length} unit-manifest failure(s):\n`)
    for (const [tag, group] of [...byTag].sort()) {
      for (const f of group) console.error(`  [${tag}]  ${f.path}\n      ${f.detail}`)
    }
    console.error(
      '\nThe manifest is a REVIEWED SNAPSHOT over a stated universe, not a\n' +
        'completeness proof. Each row says what a human concluded about one file\n' +
        'and pins that conclusion to the content it was made against.\n\n' +
        '  [unlisted]   a file entered the universe. Review it and add a row.\n' +
        '  [orphan]     a row outlived its file. Delete the row.\n' +
        '  [duplicate]  two rows for one path: one disposition hides the other.\n' +
        '  [schema]     a row claims something it does not back up.\n' +
        '  [digest]     the file changed under a disposition made against older\n' +
        '               content. Re-read it, then `--update` to re-stamp. That\n' +
        '               re-stamp is an explicit re-acknowledgement; it is NOT\n' +
        '               evidence the re-read happened.\n',
    )
    process.exit(1)
  }

  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.disposition, (counts.get(r.disposition) ?? 0) + 1)
  const summary = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([d, n]) => `${n} ${d}`)
    .join(', ')
  console.log(
    `✓ units manifest: all ${rows.length} enumerated module(s) dispositioned at this ` +
      `reviewed snapshot (${summary}).`,
  )
}

if (import.meta.main) main()
