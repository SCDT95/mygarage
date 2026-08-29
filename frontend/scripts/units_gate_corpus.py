#!/usr/bin/env python3
"""Two-sided corpus for the unit gate's two legs (plan ruling R2).

A gate that never fires is worse than no gate, because it is believed:
`eslint.config.js` once carried a `no-restricted-syntax` selector demanding two
literal `$` where the AST produces one, and it silently matched nothing for
months. So neither leg of this gate ships on a single probe. Each leg gets a
POSITIVE half it must reject and a NEGATIVE half it must accept, and a case that
passes identically whether or not the rule exists is a case that pins nothing.

★ The fixtures are OWNED BY THIS FILE. Nothing here reads a production line, so
no change under `frontend/src` can quietly leave a case unexercised the way
`mutation_harness_selftest.py`'s first version did when the source line it
patched was deleted by the very task it certified. Round 2 moved the ESLint
fixture out of `src/` as well: a run that died between the write and its
`finally` used to leave a file that failed `validate-reachability.ts`, so the
gate's own tests could break the working tree.

★ EVERY case names a mutation that flips it, and round 2 added twelve cases
because a reviewer's independent matrix found eight surviving mutants that
nothing here could kill. The structural reason is worth keeping in view:
BASELINE MODE CAN ONLY KILL TIGHTENING MUTATIONS. The script leg fails when a
count RISES and never when one falls, so every loosening of the gate reads as
migration progress, and this corpus is the sole executioner for that entire
direction.

Legs, split by PROVENANCE-SENSITIVITY (ruling R3):

  ESLint  raw conversion constants. A numeric literal means the same thing
          wherever it appears, so a purely syntactic selector is sound for it.
  script  every `=== 'imperial'` / `=== 'metric'` comparison, because deciding
          whether the left-hand side is a unit system or a theme requires
          knowing what the identifier refers to, and `no-restricted-syntax`
          performs no binding analysis at all.

Usage::

    python3 frontend/scripts/units_gate_corpus.py

Exit code: 1 if any positive passes or any negative fails.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

# frontend/scripts/units_gate_corpus.py -> frontend/scripts -> frontend.
FRONTEND = Path(__file__).resolve().parents[1]
GATE = "scripts/validate-units.ts"

# The ESLint leg is scoped by `files:` to migrated paths, so a corpus fixture has
# to sit at a path that scope names. `eslint.config.js` lists this one for that
# purpose; it exists only while this script runs.
#
# Under `scripts/`, not `src/`: the rule is path-scoped so the location is free,
# and `src/` is the subject of validate-reachability.ts and of validate-units.ts's
# own tree walk. A leaked fixture there fails an unrelated gate.
ESLINT_FIXTURE = FRONTEND / "scripts/__units_corpus__.tsx"

# Mutual exclusion between this script and units_gate_selftest.py.
#
# ★ Both scripts write the SAME fixture path, and until round 4 both deleted
# leftovers at start. Two runs overlapping therefore destroyed each other's
# fixture and could each report a result reflecting a file it did not write:
# a FALSE RESULT, which is this phase's signature defect rather than a mere
# inconvenience. The collision surface grew when the corpus joined
# `validate:translations`, because every local `bin/ci-check --frontend` now
# takes that path.
#
# So neither script cleans up at start any more. They refuse. The lock is taken
# with O_EXCL, so the refusal is a real interlock rather than a check with a
# race in the middle of it, and a stale lock after a kill is a loud manual
# cleanup rather than a quiet wrong answer.
LOCK = FRONTEND / "scripts/.units-gate.lock"


def acquire_lock(owner: str, artifacts: list[Path]) -> str | None:
    """Take the shared lock, or return the reason this run must not start."""
    stale = [a for a in artifacts if a.exists()]
    if stale:
        return (
            f"{owner}: refusing to start, these files already exist:\n"
            + "\n".join(f"    {a.relative_to(FRONTEND)}" for a in stale)
            + "\n  Either another unit-gate run is in progress, or one was killed"
            "\n  before its cleanup. Deleting them here could destroy a running"
            "\n  run's fixture and make BOTH results meaningless, so remove them"
            "\n  by hand once you are sure nothing else is running."
        )
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        return (
            f"{owner}: refusing to start, {LOCK.relative_to(FRONTEND)} is held.\n"
            "  units_gate_corpus.py and units_gate_selftest.py share a fixture"
            "\n  path and cannot run concurrently. Wait for the other run, or"
            "\n  delete the lock if you are certain none is in progress."
        )
    os.write(fd, f"{owner} pid={os.getpid()}\n".encode())
    os.close(fd)
    return None


def release_lock() -> None:
    LOCK.unlink(missing_ok=True)


@dataclass
class Case:
    """One corpus case: a fixture body plus what the leg must say about it."""

    cid: str
    body: str
    #: findings the leg must report. 0 means the case must be ACCEPTED.
    expect: int
    #: substring that must appear in every reported finding, so a case cannot be
    #: satisfied by the wrong rule firing. Empty when `expect` is 0.
    expect_kind: str = ""
    why: str = ""
    #: mutation id in units_gate_selftest.py that flips this case. Every case
    #: names one: a case no mutation can flip is an assertion true at t=0, one
    #: level up.
    pinned_by: str = ""
    #: fixture extension. `.ts` and `.tsx` are DIFFERENT languages to the
    #: parser: `<string>raw` is a type assertion in one and a broken JSX tag in
    #: the other, which is how round 1's gate went blind to whole files.
    ext: str = ".tsx"
    #: exact normalized text the single finding must carry. Pins normalize().
    expect_text: str = ""
    tags: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------
# script leg: provenance-sensitive comparisons
# --------------------------------------------------------------------------
HOOK_IMPORT = "import { useUnitPreference } from '@/hooks/useUnitPreference'\n"

SCRIPT_POSITIVE = [
    Case(
        "S-P1-eq-imperial",
        HOOK_IMPORT + "export function distanceLabel(): string {\n"
        "  const { system } = useUnitPreference()\n"
        "  return system === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "the canonical forbidden branch",
        "M17-drop-imperial-literal",
    ),
    Case(
        "S-P2-eq-metric",
        HOOK_IMPORT + "export function volumeLabel(): string {\n"
        "  const { system } = useUnitPreference()\n"
        "  return system === 'metric' ? 'L' : 'gal'\n"
        "}\n",
        1,
        "compare",
        "R2: v1 prohibited only the imperial half; production spells it both ways",
        "M20-drop-metric-literal",
    ),
    Case(
        "S-P3-yoda",
        HOOK_IMPORT + "export function isImperial(): boolean {\n"
        "  const { system } = useUnitPreference()\n"
        "  return 'imperial' === system\n"
        "}\n",
        1,
        "compare",
        "operand order must not matter",
        "M1-drop-yoda",
    ),
    Case(
        "S-P4-neq",
        HOOK_IMPORT + "export function isMetric(): boolean {\n"
        "  const { system } = useUnitPreference()\n"
        "  return system !== 'imperial'\n"
        "}\n",
        1,
        "compare",
        "negation is the same decision",
        "M2-drop-neq",
    ),
    Case(
        "S-P5-switch",
        HOOK_IMPORT + "export function pressureLabel(): string {\n"
        "  const { system } = useUnitPreference()\n"
        "  switch (system) {\n"
        "    case 'imperial':\n"
        "      return 'PSI'\n"
        "    case 'metric':\n"
        "      return 'bar'\n"
        "    default:\n"
        "      return ''\n"
        "  }\n"
        "}\n",
        2,
        "switch-case",
        "a switch is a branch wearing different punctuation",
        "M3-drop-switch",
    ),
    Case(
        "S-P6-aliased-boolean",
        HOOK_IMPORT + "export function treadLabel(): string {\n"
        "  const { system } = useUnitPreference()\n"
        "  const isImp = system === 'imperial'\n"
        "  return isImp ? 'in' : 'mm'\n"
        "}\n",
        1,
        "compare",
        "hiding the branch behind a boolean does not remove it",
        "M18-skip-variable-initialisers",
    ),
    Case(
        "S-P7-destructuring-rename",
        HOOK_IMPORT + "export function speedLabel(): string {\n"
        "  const { system: unitSystem } = useUnitPreference()\n"
        "  return unitSystem === 'imperial' ? 'mph' : 'km/h'\n"
        "}\n",
        1,
        "compare",
        "R2: a selector keyed on Identifier[name='system'] misses this",
        "M19-key-on-identifier-name",
    ),
    Case(
        "S-P8-resolvedSystem",
        HOOK_IMPORT + "export function tempLabel(): string {\n"
        "  const { system: resolvedSystem } = useUnitPreference()\n"
        "  return resolvedSystem === 'imperial' ? 'F' : 'C'\n"
        "}\n",
        1,
        "compare",
        "T4-R3: this spelling is real, at SettingsSystemTab.tsx:81",
        "M19-key-on-identifier-name",
    ),
    Case(
        "S-P9-displaySystem",
        "export function massLabel(displaySystem: string): string {\n"
        "  return displaySystem === 'metric' ? 'kg' : 'lbs'\n"
        "}\n",
        1,
        "compare",
        "T4-R3: real spelling at SettingsSystemTab.tsx:82; `string` earns no silence",
        "M6-string-is-foreign",
    ),
    Case(
        "S-P10-member-expression",
        "interface Props { system: string }\n"
        "export function torqueLabel(props: Props): string {\n"
        "  return props.system === 'imperial' ? 'lb-ft' : 'Nm'\n"
        "}\n",
        1,
        "compare",
        "an operand the gate cannot resolve is flagged, not waved through",
        "M4-unresolved-is-exempt",
    ),
    Case(
        "S-P11-annotated-unitsystem",
        "import type { UnitSystem } from '@/utils/units'\n"
        "export function economyLabel(system: UnitSystem): string {\n"
        "  return system === 'imperial' ? 'MPG' : 'L/100km'\n"
        "}\n",
        1,
        "compare",
        "the annotation exemption must not swallow the annotation that proves it",
        "M5-unitsystem-is-foreign",
    ),
    Case(
        "S-P12-ts-angle-assertion",
        "const raw: unknown = null\n"
        "export const asText = <string>raw\n"
        "export function label(system: string): string {\n"
        "  return system === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "★ legal TS, illegal TSX: round 1 parsed every file as TSX and lost this whole file",
        "M22-hardcode-tsx-scriptkind",
        ext=".ts",
    ),
    Case(
        "S-P13-unparseable",
        "export const broken = (\n",
        -1,
        "parse error",
        "★ a file the parser rejects must make the gate REFUSE, not report zero",
        "M23-ignore-parse-diagnostics",
        ext=".ts",
    ),
    Case(
        "S-P14-alias-union",
        "type Sys = 'imperial' | 'metric'\n"
        "declare function getSys(): Sys\n"
        "export function label(): string {\n"
        "  const s: Sys = getSys()\n"
        "  return s === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "R8: this repo re-declares the union, and a name denylist walks straight past an alias",
        "M24-drop-alias-expansion",
    ),
    Case(
        "S-P15-imported-alias",
        "import type { BinarySystem } from '@/utils/units'\n"
        "export function label(s: BinarySystem): string {\n"
        "  return s === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "an annotation the gate cannot resolve earns no silence: a rename is not an escape hatch",
        "M25-unresolvable-alias-is-foreign",
    ),
    Case(
        "S-P16-widened-alias",
        "type Pref = 'imperial' | 'metric' | 'custom'\n"
        "declare function getPref(): Pref\n"
        "export function label(): string {\n"
        "  const p: Pref = getPref()\n"
        "  return p === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "phase 1 widened the union to admit 'custom'; it is still a unit system",
        "M26-drop-custom-from-vocabulary",
    ),
    Case(
        "S-P17-loose-equality",
        HOOK_IMPORT + "export function label(): string {\n"
        "  const { system } = useUnitPreference()\n"
        "  return system == 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "nothing in this repo forbids ==, so the gate cannot assume === ",
        "M27-drop-loose-equality",
    ),
    Case(
        "S-P18-template-literal",
        HOOK_IMPORT + "export function label(): string {\n"
        "  const { system } = useUnitPreference()\n"
        "  return system === `imperial` ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "a backtick literal is the same comparison with different punctuation",
        "M28-drop-template-literal-kind",
    ),
    Case(
        "S-P19-shadowed-name",
        "type Theme = 'light' | 'dark' | 'imperial'\n"
        "declare function resolveTheme(): Theme\n"
        + HOOK_IMPORT
        + "export function a(): string {\n"
        "  const mode: Theme = resolveTheme()\n"
        "  return mode === 'imperial' ? 'x' : 'y'\n"
        "}\n"
        "export function b(): string {\n"
        "  const { system: mode } = useUnitPreference()\n"
        "  return mode === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        2,
        "compare",
        "the flat index the docstring argues for: one foreign declaration must not "
        "silence a bare one sharing the name",
        "M29-any-declaration-exempts",
    ),
    Case(
        "S-P20-multiline",
        HOOK_IMPORT + "export function label(): string {\n"
        "  const { system } = useUnitPreference()\n"
        "  return (\n"
        "    system ===\n"
        "    'imperial'\n"
        "      ? 'mi'\n"
        "      : 'km'\n"
        "  )\n"
        "}\n",
        1,
        "compare",
        "a wrapped comparison must key the same as a flat one or the baseline splits in two",
        "M30-drop-normalize",
        expect_text="system === 'imperial'",
    ),
    Case(
        "S-P21-non-placeholder-attribute",
        HOOK_IMPORT + "export function Field(): JSX.Element {\n"
        "  const { system } = useUnitPreference()\n"
        "  return <input title={system === 'imperial' ? 'miles' : 'kilometres'} />\n"
        "}\n",
        1,
        "compare",
        "★ R5 exempts `placeholder`, not JSX: widening it took the real gate 45 -> 37 and exit 0",
        "M31-any-jsx-attribute-exempts",
    ),
    Case(
        "S-P22-bare-pragma",
        HOOK_IMPORT + "export function label(): string {\n"
        "  const { system } = useUnitPreference()\n"
        "  // units-exempt\n"
        "  return system === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "the docstring and the failure message both promise a reason, so a bare marker cannot silence",
        "M32-pragma-without-reason",
    ),
    Case(
        "S-P23-string-union",
        "export function readStored(): string | null {\n"
        "  const stored: string | null = localStorage.getItem('unit_preference')\n"
        "  return stored === 'imperial' ? stored : null\n"
        "}\n",
        1,
        "compare",
        "the real shape at useUnitPreference.ts. Round 2 pinned this to a NAME-list "
        "mutation and the name list turned out to be redundant, so the case passed "
        "for a reason it did not name; `string` is UNKNOWN and fail-closed",
        "M41-unknown-member-is-foreign",
        ext=".ts",
    ),
    Case(
        "S-P24-unitsystem-union",
        "import type { UnitSystem } from '@/utils/units'\n"
        "export function label(s: UnitSystem | null): string {\n"
        "  return s === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "★ this is `readStoredUnitSystem`'s own return type. Round 2 caught it only "
        "because the NAME `UnitSystem` appeared in the text; spelled out or aliased "
        "it walked past. Now it is an UNKNOWN member beside a stripped nullish one",
        "M41-unknown-member-is-foreign",
        ext=".ts",
    ),
    Case(
        "S-P25-nullable-unit-union",
        "export function label(s: 'imperial' | 'metric' | null): string {\n"
        "  return s === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "★ the F2 REGRESSION: round 1 caught this, round 2 read one non-vocabulary "
        "member as proof the whole annotation was foreign. A nullable unit system "
        "is a unit system, and this is the case that exercises the vocabulary half",
        "M39-keep-nullish-members",
        ext=".ts",
    ),
    Case(
        "S-P26-parenthesised-alias",
        "type Sys = ('imperial' | 'metric')\n"
        "export function label(s: Sys): string {\n"
        "  return s === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "one pair of parentheses was a complete bypass. It is now defended twice, "
        "by paren stripping and by the fail-closed UNKNOWN class, so only a "
        "mutation removing BOTH flips it",
        "M40b-parens-unread-then-exempt",
        ext=".ts",
    ),
    Case(
        "S-P27-indexed-access",
        "const SYSTEMS = ['imperial', 'metric'] as const\n"
        "export function label(s: (typeof SYSTEMS)[number]): string {\n"
        "  return s === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "a type expression the gate cannot read is not evidence of innocence",
        "M41-unknown-member-is-foreign",
        ext=".ts",
    ),
    Case(
        "S-P28-alias-or-undefined",
        "type Sys = 'imperial' | 'metric'\n"
        "export function label(s: Sys | undefined): string {\n"
        "  return s === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "the alias must be resolved at MEMBER level, not only when it is the whole text",
        "M39-keep-nullish-members",
        ext=".ts",
    ),
    Case(
        "S-P29-backtick-vocabulary",
        "type Sys = `imperial` | 'metric'\n"
        "export function label(s: Sys): string {\n"
        "  return s === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "★ a FAIL-OPEN, not a miss: STRING_LITERAL_TYPE recognises a backtick "
        "literal, so `imperial` was confidently classified foreign instead of "
        "falling through to fail-closed unknown, and ONE such member exempted the "
        "whole union. The all-backtick spelling is the same code path.",
        "M43-drop-backtick-vocabulary",
        ext=".ts",
    ),
    # ---- phase 3b: the three shapes the comparison leg cannot see -----------
    Case(
        "S-P30-formatter-binary-call",
        "import { UnitFormatter } from '@/utils/units'\n"
        + HOOK_IMPORT
        + "export function costRate(costPerKm: number): string {\n"
        "  const { system } = useUnitPreference()\n"
        "  return UnitFormatter.formatCostPerDistance(costPerKm, system, 'USD', 'en-US')\n"
        "}\n",
        1,
        "formatter-binary",
        "★ nothing at this call site names a system: the binary collapse happens "
        "inside the callee, so the comparison leg is blind to it by construction. "
        "It spelled `formatDistance` until task 6 deleted that method, then "
        "`formatFuelEconomy` until task 6b deleted that one; each time the case "
        "scored zero and the corpus said so, because a positive naming a method "
        "the DERIVATION can no longer find is a case that passes for the wrong "
        "reason. Any surviving binary formatter exercises the same leg, so it "
        "now spells the last one standing.",
        "M44-drop-formatter-leg",
    ),
    Case(
        "S-P31-formatter-label-selector",
        "import { UnitFormatter } from '@/utils/units'\n"
        + HOOK_IMPORT
        + "export function unit(): string {\n"
        "  const { system } = useUnitPreference()\n"
        "  return UnitFormatter.getCostPerDistanceLabel(system)\n"
        "}\n",
        1,
        "formatter-binary",
        "★ THE case that makes the set DERIVED rather than transcribed: round 1 "
        "hand-listed the `format*` methods and missed every label selector, which "
        "takes the same binary system and is just as wrong for a mixed user. It "
        "spelled `getDistanceUnit` until task 6 retired that one and "
        "`getFuelRateUnit` until task 6b retired the next; a label selector is a "
        "label selector whichever quantity it names.",
        "M45-formatter-format-prefix-only",
    ),
    Case(
        "S-P32-binary-conversion-call",
        "import type { UnitSystem } from '@/utils/units'\n"
        + HOOK_IMPORT
        + "export function toCanonicalKm(value: number, system: UnitSystem): number {\n"
        "  return convert(value, system)\n"
        "}\n"
        "export function submit(entered: number): number {\n"
        "  const { system } = useUnitPreference()\n"
        "  return toCanonicalKm(entered, system)\n"
        "}\n",
        1,
        "binary-conversion",
        "★ R8: this one WRITES. `system` collapses from volume, so a "
        "{volume:'L', distance:'mi'} user's 500 miles is stored as 500 km, and "
        "neither of the originally proposed gate legs saw the function that "
        "wrote the wrong number. Task 5 DELETED the three real helpers, so the "
        "fixture declares its own: the leg reads `decimalSafe.ts` plus the file "
        "under scan, and this half is now the only half with a population. The "
        "body delegates instead of comparing so the one finding is the CALL, "
        "not a `system === 'metric'` inside the declaration",
        "M46-drop-conversion-leg",
        ext=".ts",
    ),
    Case(
        "S-P33-token-branch-property",
        "import type { UnitSet } from '@/types/units'\n"
        "export function label(units: UnitSet, km: number): string {\n"
        "  return units.volume === 'L' ? `${km} km` : `${km} mi`\n"
        "}\n",
        1,
        "token-branch",
        "scope category 4: DISTANCE collapsed out of VOLUME, with no 'imperial' "
        "or 'metric' anywhere. Live at PropaneRecordList and twice in Analytics.",
        "M47-drop-token-branch-leg",
        ext=".ts",
    ),
    Case(
        "S-P34-token-branch-destructured",
        "import type { UnitSet } from '@/types/units'\n"
        "export function label(units: UnitSet): string {\n"
        "  const { volume } = units\n"
        "  return volume === 'L' ? 'km' : 'mi'\n"
        "}\n",
        1,
        "token-branch",
        "keying on the property access alone would make one destructure a bypass, "
        "which is S-P7's rename wearing different punctuation",
        "M48-token-branch-property-only",
        ext=".ts",
    ),
    Case(
        "S-P35-aliased-formatter-receiver",
        "import { UnitFormatter as UF } from '@/utils/units'\n"
        + HOOK_IMPORT
        + "export function unit(): string {\n"
        "  const { system } = useUnitPreference()\n"
        "  return UF.getCostPerDistanceLabel(system)\n"
        "}\n",
        1,
        "formatter-binary",
        "the receiver is REQUIRED but never READ: requiring the spelling makes "
        "`import { UnitFormatter as UF }` a one-line bypass",
        "M49-formatter-receiver-spelling",
    ),
    Case(
        "S-P36-double-quoted-union",
        'type Sys = "imperial" | "metric"\n'
        "export function label(s: Sys): string {\n"
        "  return s === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        1,
        "compare",
        "R6 carry, branch 6 of 6: UNIT_VOCABULARY's double-quoted forms went in "
        "during round 2 and were still unexercised three rounds later",
        "M50-drop-double-quoted-vocabulary",
        ext=".ts",
    ),
]

SCRIPT_NEGATIVE = [
    Case(
        "S-N1-placeholder",
        HOOK_IMPORT + "export function OdometerField(): JSX.Element {\n"
        "  const { system } = useUnitPreference()\n"
        "  return <input placeholder={system === 'imperial' ? '45000' : '72420'} />\n"
        "}\n",
        0,
        why="R5: a placeholder is a plausible EXAMPLE value; nothing canonical to convert",
        pinned_by="M7-drop-placeholder-exemption",
    ),
    Case(
        "S-N2-foreign-provenance",
        "type Theme = 'light' | 'dark' | 'imperial'\n"
        "declare function resolveTheme(): Theme\n"
        "export function themeClass(): string {\n"
        "  const theme: Theme = resolveTheme()\n"
        "  return theme === 'imperial' ? 'skin-imperial' : 'skin-plain'\n"
        "}\n",
        0,
        why="R3: the case no no-restricted-syntax selector can tell apart, and the "
        "one that decides how per-member classification must round: a member no unit "
        "system has ever contained means a different enum sharing a spelling",
        pinned_by="M8-drop-annotation-exemption / M38-any-unit-member-flags",
    ),
    Case(
        "S-N6-parenthesised-foreign-alias",
        "type Theme = ('light' | 'dark' | 'imperial')\n"
        "declare function resolveTheme(): Theme\n"
        "export function themeClass(): string {\n"
        "  const theme: Theme = resolveTheme()\n"
        "  return theme === 'imperial' ? 'a' : 'b'\n"
        "}\n",
        0,
        why="paren stripping can only be pinned from the NEGATIVE side: dropping it "
        "makes the gate stricter, so no positive can flip, and this one goes 0 to 1",
        pinned_by="M40-drop-paren-stripping",
        ext=".ts",
    ),
    Case(
        "S-N3-near-miss-literal",
        "export function describe(label: Readonly<{ text: string }>): boolean {\n"
        "  return label.text === 'imperial units'\n"
        "}\n",
        0,
        why="the literal must match exactly, not merely contain the word",
        pinned_by="M9-literal-contains",
    ),
    Case(
        "S-N4-pragma",
        HOOK_IMPORT + "export function legacyLabel(): string {\n"
        "  const { system } = useUnitPreference()\n"
        "  // units-exempt: parses a browser key phase 4 retires, not a display branch\n"
        "  const above = system === 'imperial' ? 'mi' : 'km'\n"
        "  const same = system === 'metric' ? 'km' : 'mi' // units-exempt: same reason\n"
        "  return above + same\n"
        "}\n",
        0,
        why="R4: BOTH documented positions, the line above and the line itself",
        pinned_by="M10a-drop-same-line-pragma / M10b-drop-line-above-pragma",
    ),
    Case(
        "S-N5-positive-control",
        "import { useUnitFormat } from '@/hooks/useUnitFormat'\n"
        "export function TreadCell(props: Readonly<{ mm: number; label: string }>): JSX.Element {\n"
        "  const u = useUnitFormat()\n"
        "  const unlabelled = props.label === ''\n"
        "  return <span>{unlabelled ? '' : u.tread.toDisplayText(props.mm)}</span>\n"
        "}\n",
        0,
        why="T4-R7 positive control: correctly migrated code must be silently clean",
        pinned_by="M11-flag-every-equality",
        tags=["control"],
    ),
    # ---- phase 3b: what the three new legs must NOT catch -------------------
    Case(
        "S-N7-formatter-resolved-set",
        "import { UnitFormatter } from '@/utils/units'\n"
        "import type { UnitSet } from '@/types/units'\n"
        "export function label(liters: number, units: UnitSet): string {\n"
        "  return UnitFormatter.formatVolume(liters, units)\n"
        "}\n",
        0,
        why="the DESTINATION shape. A UnitSet-taking formatter is what the binary "
        "ones must become, so a leg that flags it flags correct code",
        pinned_by="M51-every-static-method-is-binary",
        ext=".ts",
    ),
    Case(
        "S-N8-local-format-distance",
        "import type { UnitSet } from '@/types/units'\n"
        "function formatFuelEconomy(l100km: number, units: UnitSet): string {\n"
        "  return `${l100km} ${units.consumption}`\n"
        "}\n"
        "export function cell(v: number, units: UnitSet): string {\n"
        "  return formatFuelEconomy(v, units)\n"
        "}\n",
        0,
        why="★ POICard's real shape, measured: matching the METHOD NAME alone "
        "flagged three module-local `formatDistance` helpers, and POICard's is "
        "correct migrated code taking a resolved set. A static method is only "
        "reachable through a receiver, so requiring one separates them. "
        "★ IT SPELLED THAT HELPER `formatDistance` UNTIL TASK 6, and the rename "
        "is the case working rather than the case bending: retiring "
        "`UnitFormatter.formatDistance` took that name out of the DERIVED set, so "
        "the fixture stopped colliding with anything and M52 became a survivor "
        "flipping nothing. The selftest said so. The rule is unchanged and still "
        "guards the six surviving binary names, so the fixture uses one of them; a "
        "negative that can no longer be made positive is not a negative.",
        pinned_by="M52-formatter-name-without-receiver",
        ext=".ts",
    ),
    Case(
        "S-N9-set-conversion-helper",
        "import { toCanonicalLiters } from '@/utils/decimalSafe'\n"
        "import type { UnitSet } from '@/types/units'\n"
        "export function submit(entered: number, units: UnitSet): number | null {\n"
        "  return toCanonicalLiters(entered, units)\n"
        "}\n",
        0,
        why="R8's destination: the resolved-set converter beside the binary ones "
        "in the same file, so the leg cannot key on the file or the name prefix",
        pinned_by="M53-every-exported-helper-is-binary",
        ext=".ts",
    ),
    Case(
        "S-N10-foreign-token-property",
        "export function size(shirt: Readonly<{ size: string }>): string {\n"
        "  return shirt.size === 'L' ? 'large' : 'small'\n"
        "}\n",
        0,
        why="'L' is a volume token and `size` is not a quantity. Without the "
        "property name in the rule, every shirt is a fuel record.",
        pinned_by="M54-token-branch-any-property",
        ext=".ts",
    ),
    Case(
        "S-N11-wrong-quantity-vocabulary",
        "export function isKg(record: Readonly<{ pressure: string }>): boolean {\n"
        "  return record.pressure === 'kg'\n"
        "}\n",
        0,
        why="`pressure` IS a quantity and 'kg' IS a token, but not of that "
        "quantity. Pooling the ten vocabularies into one loses the pairing.",
        pinned_by="M55-token-vocabulary-is-pooled",
        ext=".ts",
    ),
    Case(
        "S-N12-secondary-gallon",
        "import type { UnitSet } from '@/types/units'\n"
        "export function showsPanel(units: UnitSet): boolean {\n"
        "  return units.secondary_gallon === 'uk'\n"
        "}\n",
        0,
        why="★ R1's exemption, made STRUCTURAL rather than a prose pragma: the "
        "gallon flavour is a choice BETWEEN units with no quantity to convert, "
        "and UNIT_QUANTITIES excludes it behind a compile-time completeness proof",
        pinned_by="M56-secondary-gallon-is-a-quantity",
        ext=".ts",
    ),
    # ---- phase 3b: the R6 carry, five of the six unexercised helper branches -
    Case(
        "S-N13-doubly-parenthesised-foreign",
        "type Theme = ('light') | ('imperial')\n"
        "export function themeClass(theme: Theme): string {\n"
        "  return theme === 'imperial' ? 'a' : 'b'\n"
        "}\n",
        0,
        why="R6 carry, branch 2 of 6: stripOuterParens' balance check. Without "
        "it the outer parens are stripped across the union, both halves become "
        "unreadable, and fail-closed UNKNOWN flags correct code.",
        pinned_by="M57-drop-paren-balance-check",
        ext=".ts",
    ),
    Case(
        "S-N14-void-and-never-members",
        "type Theme = 'light' | 'dark' | void | never\n"
        "export function themeClass(theme: Theme): string {\n"
        "  return theme === 'imperial' ? 'a' : 'b'\n"
        "}\n",
        0,
        why="R6 carry, branch 3 of 6: only `null` and `undefined` were ever "
        "exercised. Dropped from NULLISH_MEMBERS, `void` reads as a bare "
        "identifier, resolves to nothing, and takes the whole union to UNKNOWN.",
        pinned_by="M58-drop-void-never-nullish",
        ext=".ts",
    ),
    Case(
        "S-N15-numeric-and-boolean-members",
        "type Flag = 'imperial' | 0 | true\n"
        "export function on(flag: Flag): boolean {\n"
        "  return flag === 'imperial'\n"
        "}\n",
        0,
        why="R6 carry, branch 4 of 6: STRING_LITERAL_TYPE's numeric and boolean "
        "alternatives. The gate docstring already states this rounding (a "
        "recognised literal no unit system contains means a different enum); "
        "nothing exercised it.",
        pinned_by="M59-drop-numeric-boolean-literals",
        ext=".ts",
    ),
    Case(
        "S-N16-all-nullish-annotation",
        "export function label(s: null | undefined): string {\n"
        "  return s === 'imperial' ? 'mi' : 'km'\n"
        "}\n",
        0,
        why="R6 carry, branch 5 of 6: the all-nullish return. A degenerate "
        "annotation rather than production code, kept because the branch is "
        "otherwise unexercised and returning UNKNOWN instead would flag it.",
        pinned_by="M60-all-nullish-is-unknown",
        ext=".ts",
    ),
]

# --------------------------------------------------------------------------
# ESLint leg: provenance-free conversion constants
# --------------------------------------------------------------------------
ESLINT_POSITIVE = [
    Case(
        "E-P1-metres-per-mile",
        "export const RADIUS_M = 1609.34\n",
        1,
        "Raw unit-conversion constant",
        "the three copies phase 3a deleted; the named low-precision list",
        "M12-drop-named-list",
    ),
    Case(
        "E-P2-litres-per-gallon",
        "export const LITERS_PER_GALLON = 3.78541\n",
        1,
        "High-precision numeric literal",
        "defect L1's constant",
        "M21-narrow-precision-threshold",
    ),
    Case(
        "E-P3-mm-per-inch",
        "export const MM_PER_IN = 25.4\n",
        1,
        "Raw unit-conversion constant",
        "the factor the frontend did not have until the adapter supplied it",
        "M12-drop-named-list",
    ),
    Case(
        "E-P4-mpg-to-l100km",
        "export const US_MPG_TO_L100KM = 235.214\n",
        1,
        "Raw unit-conversion constant",
        "three fractional digits, so only the named list can see it",
        "M12-drop-named-list",
    ),
    Case(
        "E-P5-bar-to-psi",
        "export const barToPsi = 14.5038\n",
        1,
        "High-precision numeric literal",
        "R7: the fourth telemetry factor nobody had listed",
        "M21-narrow-precision-threshold",
    ),
    Case(
        "E-P6-unlisted-factor",
        "export const SOME_NEW_FACTOR = 1.234567\n",
        1,
        "High-precision numeric literal",
        "★ the anti-floor case: a factor no ruling, spec or enumerator named",
        "M21-narrow-precision-threshold",
    ),
    Case(
        "E-P7-c-to-f-ninths",
        "export const toF = (c: number): number => (c * 9) / 5 + 32\n",
        1,
        "Inline Celsius-to-Fahrenheit",
        "R7: the idiom appeared in four files and holds no matchable constant",
        "M14-drop-cf-idiom",
    ),
    Case(
        "E-P9-uk-mpg-factor",
        "export const UK_MPG_TO_L100KM = 282.481\n",
        1,
        "Raw unit-conversion constant",
        "the one named factor round 1's corpus never exercised",
        "M33-drop-uk-mpg-from-named-list",
    ),
    Case(
        "E-P10-i18n-guard-survives-scoping",
        "export const price = (amount: number): string => `$${amount}`\n",
        1,
        "Avoid raw $",
        "the migrated block REPLACES the rule's options, so it must spread the "
        "i18n guards back in; without a case here that regression is silent",
        "M34-drop-i18n-spread",
    ),
    Case(
        "E-P8-c-to-f-decimal",
        "export const toF2 = (c: number): number => c * 1.8 + 32\n",
        1,
        "Inline Celsius-to-Fahrenheit",
        "the same conversion spelled with 1.8, which is too generic to list",
        "M14-drop-cf-idiom",
    ),
]

ESLINT_NEGATIVE = [
    Case(
        "E-N1-propane-density",
        "// Propane density: 1 kg is about 1.968 L. Physical, not a unit system.\n"
        "export const KG_TO_LITERS = 1.968\n",
        0,
        why="R5: a physical density, unit-system independent, and CORRECT",
        pinned_by="M13-widen-precision-threshold",
    ),
    Case(
        "E-N2-string-that-looks-like-a-factor",
        "export const PLACEHOLDER = '3.78541'\n",
        0,
        why="the rule reads a numeric literal's raw text, not any string's value",
        pinned_by="M15-match-value-not-raw",
    ),
    Case(
        "E-N3-ordinary-ui-numbers",
        "export const OPACITY = 0.5\n"
        "export const DEBOUNCE_MS = 250\n"
        "export const LINE_HEIGHT = 1.5\n"
        "export const MAX_DECIMAL = 9999.999\n",
        0,
        why="a noisy gate is a gate people turn off",
        pinned_by="M13-widen-precision-threshold",
    ),
    Case(
        "E-N4-positive-control",
        "import { useUnitFormat } from '@/hooks/useUnitFormat'\n"
        "export function RadiusLabel(props: Readonly<{ km: number }>): JSX.Element {\n"
        "  const u = useUnitFormat()\n"
        "  const rounded = Math.round(props.km * 10) / 10\n"
        "  return <span>{u.distance.toDisplayText(rounded)}</span>\n"
        "}\n",
        0,
        why="T4-R7 positive control: correctly migrated code must be silently clean",
        pinned_by="M16-flag-every-number",
        tags=["control"],
    ),
]


# --------------------------------------------------------------------------
# runners
# --------------------------------------------------------------------------
def _refusal(err: str) -> str:
    """Canonicalise ANY refusal to its substantive, path-free message.

    The raw stderr carries the gate's own path and a stack trace, so pointing
    the runner at a mutated COPY changed this string for every mutation and made
    S-P13 look as though it flipped 26 times over.

    ★ Round 2 canonicalised only the PARSE-ERROR refusal and left a raw
    `stderr[-200:]` fallback. That fallback was unreachable at the time and
    became reachable the moment `M42` was written: the one mutation that pins
    the missing-parseDiagnostics guard makes every scan refuse with a DIFFERENT
    message, so S-P13 counted as flipped while its behaviour was identical. A
    canonicaliser with a path-bearing fallback is the bug it was written to fix,
    holding its breath. Every message the gate can throw is matched here, and
    anything unmatched has its paths and stack frames removed rather than being
    passed through.
    """
    for rx in (
        r"parsed as (?:TS|TSX) with \d+ parse error\(s\)[^\n]*",
        r"this TypeScript build exposes no parseDiagnostics[^\n]*",
        r"typescript did not expose createSourceFile[^\n]*",
    ):
        m = re.search(rx, err)
        if m:
            return f"refused: {m.group(0)}"
    cleaned = [
        re.sub(r"(?:/[\w.@+-]+)+", "<path>", line).strip()
        for line in err.splitlines()
        if line.strip() and not re.match(r"\s*at\s", line)
    ]
    return f"refused: {' | '.join(cleaned)[-200:] if cleaned else 'no message'}"


def run_script_leg(case: Case, tmpdir: Path, gate: str = GATE) -> tuple[int, list[str]]:
    """Scan one fixture with validate-units.ts and return (count, detail).

    A count of -1 means the gate REFUSED, which for S-P13 is the correct answer
    rather than an error: a file the parser rejects must not read as a clean one.
    """
    path = tmpdir / f"{case.cid}{case.ext}"
    path.write_text(case.body)
    p = subprocess.run(
        ["bun", "run", gate, "--scan", str(path)],
        cwd=FRONTEND,
        capture_output=True,
        text=True,
    )
    if p.returncode != 0:
        return -1, [_refusal(p.stderr or p.stdout)]
    try:
        payload = json.loads(p.stdout)
    except json.JSONDecodeError:
        return -1, [f"gate emitted non-JSON: {p.stdout.strip()[:200]}"]
    findings = payload["findings"]
    return len(findings), [f"{f['kind']} {f['text']}" for f in findings]


def run_eslint_leg(case: Case, config: str | None = None) -> tuple[int, list[str]]:
    """Lint one fixture at the corpus path and return (count, messages)."""
    ESLINT_FIXTURE.write_text(case.body)
    argv = ["bunx", "eslint", "--format", "json"]
    if config is not None:
        argv += ["--config", config]
    p = subprocess.run(
        [*argv, str(ESLINT_FIXTURE)],
        cwd=FRONTEND,
        capture_output=True,
        text=True,
    )
    try:
        payload = json.loads(p.stdout)
    except json.JSONDecodeError:
        return -1, [f"eslint emitted non-JSON: {(p.stdout or p.stderr).strip()[:300]}"]
    msgs = [
        m["message"]
        for f in payload
        for m in f["messages"]
        if m.get("ruleId") == "no-restricted-syntax"
    ]
    return len(msgs), msgs


def check(case: Case, got: int, detail: list[str]) -> str | None:
    """Return a failure description, or None when the case behaved."""
    if got != case.expect:
        return (
            f"expected {case.expect} finding(s), got {got}: {[d[:160] for d in detail]}"
        )
    if case.expect != 0 and case.expect_kind:
        wrong = [d for d in detail if case.expect_kind not in d]
        if wrong:
            return (
                f"*** WRONG RULE FIRED *** expected {case.expect_kind!r}, "
                f"got {[d[:160] for d in wrong]}"
            )
    if case.expect_text:
        texts = [d.split(" ", 1)[1] if " " in d else d for d in detail]
        if texts != [case.expect_text]:
            return f"*** WRONG TEXT *** expected {[case.expect_text]}, got {texts}"
    return None


def main() -> int:
    refusal = acquire_lock("units_gate_corpus.py", [ESLINT_FIXTURE])
    if refusal:
        print(refusal)
        return 2
    failures: list[str] = []
    tmpdir = Path(tempfile.mkdtemp(prefix="units-corpus-"))
    try:
        for title, cases, runner in (
            ("script leg  POSITIVE (must be REJECTED)", SCRIPT_POSITIVE, "script"),
            ("script leg  NEGATIVE (must be ACCEPTED)", SCRIPT_NEGATIVE, "script"),
            ("ESLint leg  POSITIVE (must be REJECTED)", ESLINT_POSITIVE, "eslint"),
            ("ESLint leg  NEGATIVE (must be ACCEPTED)", ESLINT_NEGATIVE, "eslint"),
        ):
            print(f"\n{title}")
            print("-" * 78)
            for case in cases:
                if runner == "script":
                    got, detail = run_script_leg(case, tmpdir)
                else:
                    got, detail = run_eslint_leg(case)
                bad = check(case, got, detail)
                mark = "FAIL" if bad else ("rejected" if case.expect else "accepted")
                print(f"  {case.cid:<34} {mark:<9} {bad or case.why}")
                if bad:
                    failures.append(f"{case.cid}: {bad}")
    finally:
        ESLINT_FIXTURE.unlink(missing_ok=True)
        for leftover in tmpdir.glob("*"):
            leftover.unlink()
        tmpdir.rmdir()
        release_lock()

    total = (
        len(SCRIPT_POSITIVE)
        + len(SCRIPT_NEGATIVE)
        + len(ESLINT_POSITIVE)
        + len(ESLINT_NEGATIVE)
    )
    print()
    if failures:
        print(f"CORPUS: {len(failures)} of {total} case(s) FAILED")
        for f in failures:
            print("  " + f)
        return 1
    print(f"CORPUS: all {total} cases behaved (positives rejected, negatives accepted)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
