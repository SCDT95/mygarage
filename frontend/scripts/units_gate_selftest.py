#!/usr/bin/env python3
"""Mutation-test the unit gate against its own corpus, plus a positive control.

★ The rule this file exists for: any artifact asserting completeness must
itself be mutation-tested against what it claims to cover. `units_gate_corpus.py`
is such an artifact, and a corpus case that passes identically whether or not
the rule exists is an assertion true at t=0, one level up. Task 3's corpus had
exactly that defect: its negative case declared a const and never called `t()`,
so the anchor it existed to justify was pinned by nothing.

So every case in the corpus names a mutation here, and this file proves that the
mutation FLIPS THAT CASE AND ONLY THAT CASE. A run that reports "some case
failed" would report success forever if a different case broke, which is why the
comparison is by case id and the failure reads *** WRONG CASES FLIPPED ***.

★ ROUND 2, and the finding that shaped it: a reviewer's independent matrix
found EIGHT surviving mutants, none of which the corpus, this selftest, the real
gate or `bun run lint` could kill. The structural cause is worth stating rather
than patching around:

    BASELINE MODE CAN ONLY KILL TIGHTENING MUTATIONS.

The gate fails when an occurrence count RISES and never when one falls, so every
loosening reads as migration progress. The corpus is therefore the sole
executioner for the entire loosening direction, which is where all eight
survivors sat. The mutation table below is now weighted accordingly.

Three more things it proves, each demanded by a ruling:

  T4-R6  the ESLint leg's `files:` scope is real, and every path in it names a
         file that exists (a typo silently un-scopes a file and ESLint never
         warns about a `files:` entry that matches nothing).
  R4     the baseline is keyed by occurrence COUNT and not set membership.
  T4-R7  a guard that fires unconditionally is as worthless as one that never
         fires, and looks healthier. Both legs carry a positive control.

★ NOTHING HERE MUTATES A COMMITTED FILE. Round 1 patched `validate-units.ts` and
`eslint.config.js` in place, so a run that died mid-way left the repo modified,
and that was the real reason neither script could be wired into CI. Every
mutation is applied to a `*.mutant.generated.*` COPY which the tools are pointed
at explicitly, and `eslint.config.js` ignores that suffix so even a leaked copy
is inert. The fixtures likewise live outside `src/`, where a leak used to fail
`validate-reachability.ts`.

★ And the mutants prove themselves valid before they are scored: a mutation that
broke the gate outright would flip every case at once and could masquerade as a
successful wide mutation. Each one must still run cleanly on a control input
first, the same check `mutation_harness.py` learned to make after round 1 scored
a syntax-broken mutant as a clean survivor.

The reference results are DERIVED by running the corpus once, never passed in.

Usage::

    python3 frontend/scripts/units_gate_selftest.py

Exit code: 1 if any mutation fails to flip exactly the cases that name it.
"""

from __future__ import annotations

import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "units_corpus", Path(__file__).parent / "units_gate_corpus.py"
)
C = importlib.util.module_from_spec(spec)
# Registered before execution because @dataclass resolves annotations through
# sys.modules, and a module loaded by path alone is not there yet.
sys.modules["units_corpus"] = C
spec.loader.exec_module(C)

FRONTEND = C.FRONTEND
GATE_SRC = FRONTEND / "scripts/validate-units.ts"
ESLINT_CFG = FRONTEND / "eslint.config.js"

# Mutated copies. Never the originals. The `.mutant.generated.` infix is what
# eslint.config.js ignores, and it must not be widened to `.generated.` because
# src/types/api.generated.ts is linted.
GATE_MUTANT = FRONTEND / "scripts/units-gate.mutant.generated.ts"
CFG_MUTANT = FRONTEND / "eslint.mutant.generated.js"

# Fixtures this file owns outright, all outside src/.
SCOPE_FIXTURE = FRONTEND / "scripts/__units_scope_probe__.tsx"

# A control input for the mutant-validity check: no numbers, no comparisons, so
# it stays clean under every mutation including the deliberately over-firing
# ones. Anything other than "runs and reports nothing" means the mutant is
# broken rather than merely wrong.
VALIDITY_PROBE = "export const OK = 'ok'\n"


@dataclass
class Mutation:
    """One deliberate defect in a COPY of the gate, and the cases it must flip.

    `also` carries further simultaneous edits, because some guards are defended
    twice and removing either one alone flips nothing. Round 2 hit that with `UnitSystem` (the name list
    and the fail-closed identifier rule) and round 3 hits it again with
    parenthesised aliases (paren stripping and the fail-closed UNKNOWN class).
    A mutation that flips nothing is a survivor wearing a mutation's name, so
    the honest fix is a mutation that removes every defence at once.
    """

    mid: str
    target: str  # 'gate' or 'config'
    old: str
    new: str
    leg: str
    flips: list[str] = field(default_factory=list)
    why: str = ""
    #: further simultaneous edits, for a guard that is defended more than once.
    also: list[tuple[str, str]] = field(default_factory=list)
    #: what the validity probe must see. 'clean' is the default: the mutant runs
    #: and reports nothing on an input with nothing in it. 'refuses' is for a
    #: mutation whose whole point is that the gate now refuses everything, where
    #: a clean probe would read as a broken mutant.
    expect_probe: str = "clean"


MUTATIONS = [
    # ---------------- script leg: what the detector must catch ----------------
    Mutation(
        "M17-drop-imperial-literal",
        "gate",
        "const SYSTEM_LITERALS = new Set(['imperial', 'metric'])",
        "const SYSTEM_LITERALS = new Set(['metric'])",
        "script",
        [
            "S-P1-eq-imperial",
            "S-P3-yoda",
            "S-P4-neq",
            "S-P5-switch",
            "S-P6-aliased-boolean",
            "S-P7-destructuring-rename",
            "S-P8-resolvedSystem",
            "S-P10-member-expression",
            "S-P11-annotated-unitsystem",
            "S-P12-ts-angle-assertion",
            "S-P14-alias-union",
            "S-P15-imported-alias",
            "S-P16-widened-alias",
            "S-P17-loose-equality",
            "S-P18-template-literal",
            "S-P19-shadowed-name",
            "S-P20-multiline",
            "S-P21-non-placeholder-attribute",
            "S-P22-bare-pragma",
            "S-P23-string-union",
            "S-P24-unitsystem-union",
            "S-P25-nullable-unit-union",
            "S-P26-parenthesised-alias",
            "S-P27-indexed-access",
            "S-P28-alias-or-undefined",
            "S-P29-backtick-vocabulary",
        ],
        "half the vocabulary is half the gate",
    ),
    Mutation(
        "M20-drop-metric-literal",
        "gate",
        "const SYSTEM_LITERALS = new Set(['imperial', 'metric'])",
        "const SYSTEM_LITERALS = new Set(['imperial'])",
        "script",
        ["S-P2-eq-metric", "S-P5-switch", "S-P9-displaySystem"],
        "R2: v1 prohibited only the imperial half and production uses both",
    ),
    Mutation(
        "M1-drop-yoda",
        "gate",
        "        const leftIsLiteral = isSystemLiteral(node.left)",
        "        const leftIsLiteral = false",
        "script",
        ["S-P3-yoda"],
        "a literal-on-the-left comparison is the same decision",
    ),
    Mutation(
        "M2-drop-neq",
        "gate",
        "  ts.SyntaxKind.ExclamationEqualsEqualsToken,\n  ts.SyntaxKind.EqualsEqualsToken,",
        "  ts.SyntaxKind.EqualsEqualsToken,",
        "script",
        ["S-P4-neq"],
        "negation is not an escape hatch",
    ),
    Mutation(
        "M27-drop-loose-equality",
        "gate",
        "  ts.SyntaxKind.EqualsEqualsToken,\n  ts.SyntaxKind.ExclamationEqualsToken,\n",
        "",
        "script",
        ["S-P17-loose-equality"],
        "nothing in this repo forbids `==`, so the gate cannot assume `===`",
    ),
    Mutation(
        "M28-drop-template-literal-kind",
        "gate",
        "  ts.SyntaxKind.NoSubstitutionTemplateLiteral,\n",
        "",
        "script",
        ["S-P18-template-literal"],
        "a backtick literal is the same comparison with different punctuation",
    ),
    Mutation(
        "M3-drop-switch",
        "gate",
        "    if (node.kind === ts.SyntaxKind.CaseClause && isSystemLiteral(node.expression)) {",
        "    if (false && node.kind === ts.SyntaxKind.CaseClause) {",
        "script",
        ["S-P5-switch"],
        "a switch is a branch wearing different punctuation",
    ),
    Mutation(
        "M18-skip-variable-initialisers",
        "gate",
        "    ts.forEachChild(node, walk)\n  }\n\n  walk(sf)",
        "    if (node.kind === ts.SyntaxKind.VariableDeclaration) return\n"
        "    ts.forEachChild(node, walk)\n  }\n\n  walk(sf)",
        "script",
        ["S-P6-aliased-boolean"],
        "a walker that stops short of initialisers misses the aliased boolean. "
        "Predicted S-P14 and S-P16 too and that was wrong: their comparison is in "
        "a return, and only the declaration they read from is an initialiser.",
    ),
    Mutation(
        "M19-key-on-identifier-name",
        "gate",
        "          if (!hasForeignProvenance(operand, index) && !isPlaceholderAttribute(node)) {",
        "          if (operand.text === 'system' && !isPlaceholderAttribute(node)) {",
        "script",
        [
            "S-P7-destructuring-rename",
            "S-P8-resolvedSystem",
            "S-P9-displaySystem",
            "S-P10-member-expression",
            "S-P14-alias-union",
            "S-P15-imported-alias",
            "S-P16-widened-alias",
            "S-P19-shadowed-name",
            "S-P23-string-union",
            "S-P24-unitsystem-union",
            "S-P25-nullable-unit-union",
            "S-P26-parenthesised-alias",
            "S-P27-indexed-access",
            "S-P28-alias-or-undefined",
            "S-P29-backtick-vocabulary",
        ],
        "★ R2's forbidden implementation: it passes every case that spells the "
        "variable `system` and misses both spellings production actually uses",
    ),
    Mutation(
        "M4-unresolved-is-exempt",
        "gate",
        "  if (operand.kind !== ts.SyntaxKind.Identifier) return false",
        "  if (operand.kind !== ts.SyntaxKind.Identifier) return true",
        "script",
        ["S-P10-member-expression"],
        "fail-open on an unresolvable operand is how a gate becomes a floor",
    ),
    Mutation(
        "M24-drop-alias-expansion",
        "gate",
        "    if (body === undefined || depth >= 8) return 'unknown'\n"
        "    return classifyAnnotation(body, aliases, depth + 1)",
        "    if (body === undefined || depth >= 8) return 'unknown'\n    return 'foreign'",
        "script",
        [
            "S-P14-alias-union",
            "S-P16-widened-alias",
            "S-P26-parenthesised-alias",
            "S-P28-alias-or-undefined",
            "S-P29-backtick-vocabulary",
        ],
        "★ R8's hole: a name denylist walks straight past `type Sys = 'imperial'|'metric'`",
    ),
    Mutation(
        "M41a-unresolvable-name-is-foreign",
        "gate",
        "    if (body === undefined || depth >= 8) return 'unknown'",
        "    if (body === undefined || depth >= 8) return 'foreign'",
        "script",
        [
            "S-P9-displaySystem",
            "S-P11-annotated-unitsystem",
            "S-P12-ts-angle-assertion",
            "S-P15-imported-alias",
            "S-P23-string-union",
            "S-P24-unitsystem-union",
        ],
        "an imported alias the gate cannot read is not evidence of innocence, and "
        "since round 3 deleted the redundant NAME denylist this one rule is also "
        "what keeps `string`, `any`, `unknown` and `UnitSystem` non-exempt",
    ),
    Mutation(
        "M26-drop-custom-from-vocabulary",
        "gate",
        # Anchored to the whole line, not to a fragment of a single-line set
        # literal: round 4 reformatted UNIT_VOCABULARY across several lines and
        # the old fragment anchor stopped matching. The PATTERN guard caught it
        # as "occurs 0 times", which is the guard doing its job on my own edit.
        "  \"'custom'\",\n",
        "",
        "script",
        ["S-P16-widened-alias"],
        "phase 1 widened the union to admit 'custom' and it is still a unit system",
    ),
    Mutation(
        "M29-any-declaration-exempts",
        "gate",
        "  return annotations.every((a) => a !== null && isForeignAnnotation(a, index.aliases))",
        "  return annotations.some((a) => a !== null && isForeignAnnotation(a, index.aliases))",
        "script",
        ["S-P19-shadowed-name"],
        "the flat index is deliberate: one foreign declaration must not silence a "
        "bare one sharing the name",
    ),
    Mutation(
        "M30-drop-normalize",
        "gate",
        "  return text.replace(/\\s+/g, ' ').trim()",
        "  return text",
        "script",
        ["S-P20-multiline"],
        "a wrapped comparison must key the same as a flat one or the baseline splits",
    ),
    Mutation(
        "M22-hardcode-tsx-scriptkind",
        "gate",
        "  const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS",
        "  const kind = ts.ScriptKind.TSX",
        "script",
        ["S-P12-ts-angle-assertion"],
        "★ round 1's CRITICAL: `<string>raw` is legal TS and illegal TSX, so the "
        "parser dropped the subtree and the whole file went silent",
    ),
    Mutation(
        "M23-ignore-parse-diagnostics",
        "gate",
        "  if (diagnostics.length > 0) {",
        "  if (false) {",
        "script",
        ["S-P13-unparseable"],
        "★ the other half of round 1's CRITICAL: a wrecked parse reported as a clean file",
    ),
    Mutation(
        "M43-drop-backtick-vocabulary",
        "gate",
        "  '`imperial`',\n  '`metric`',\n  '`custom`',\n",
        "",
        "script",
        ["S-P29-backtick-vocabulary"],
        "★ the round-3 FAIL-OPEN: STRING_LITERAL_TYPE recognises a backtick "
        "literal, so a missing vocabulary entry did not fall through to "
        "fail-closed unknown, it was confidently classified foreign and exempted "
        "the whole union. A gate with a known fail-open is not a gate.",
    ),
    Mutation(
        "M39-nullish-member-is-foreign",
        "gate",
        "  if (NULLISH_MEMBERS.has(m)) return 'nullish'",
        "  if (NULLISH_MEMBERS.has(m)) return 'foreign'",
        "script",
        ["S-P25-nullable-unit-union", "S-P28-alias-or-undefined"],
        "★ round 2's F2 REGRESSION, reintroduced on purpose: treat `null` as an "
        "ordinary foreign member and `'imperial' | 'metric' | null` becomes exempt, "
        "which is exactly the shape round 1 caught and round 2 lost",
    ),
    Mutation(
        "M41b-unreadable-type-is-foreign",
        "gate",
        "    return classifyAnnotation(body, aliases, depth + 1)\n  }\n  return 'unknown'\n}",
        "    return classifyAnnotation(body, aliases, depth + 1)\n  }\n  return 'foreign'\n}",
        "script",
        ["S-P27-indexed-access"],
        "a type expression the gate cannot parse must not be read as innocence",
    ),
    Mutation(
        "M40b-parens-unread-then-exempt",
        "gate",
        "    return classifyAnnotation(body, aliases, depth + 1)\n  }\n  return 'unknown'\n}",
        "    return classifyAnnotation(body, aliases, depth + 1)\n  }\n  return 'foreign'\n}",
        "script",
        ["S-P26-parenthesised-alias", "S-P27-indexed-access"],
        "a parenthesised unit alias is defended twice, by paren stripping and by "
        "the fail-closed UNKNOWN class, so only removing BOTH flips it",
        also=[("  while (out.startsWith('(') && out.endsWith(')')) {", "  while (false) {")],
    ),
    Mutation(
        "M42-no-parse-diagnostics-property",
        "gate",
        "  const diagnostics = sf.parseDiagnostics",
        "  const diagnostics = undefined",
        "script",
        [],  # filled in below: every script case
        "★ F1's other half, unpinned until now. `parseDiagnostics` is internal to "
        "the compiler and absent from its public typings, so a build that stopped "
        "exposing it would silently restore the blindness. The guard turns that "
        "into a refusal on every file, which is why this mutation needs the "
        "'refuses' probe: a clean probe would read a deliberate refusal as a "
        "broken mutant.",
        expect_probe="refuses",
    ),
    # ---------------- script leg: what the detector must NOT catch -----------
    Mutation(
        "M7-drop-placeholder-exemption",
        "gate",
        " && !isPlaceholderAttribute(node)",
        "",
        "script",
        ["S-N1-placeholder"],
        "R5: a placeholder is an example value, and flagging it flags correct code",
    ),
    Mutation(
        "M31-any-jsx-attribute-exempts",
        "gate",
        "      return cur.name?.text === 'placeholder'",
        "      return true",
        "script",
        ["S-P21-non-placeholder-attribute"],
        "★ widening R5 from `placeholder` to any JSX attribute took the real gate "
        "from 45 findings to 37, exit 0, reported as '8 fixed'",
    ),
    Mutation(
        "M8-drop-annotation-exemption",
        "gate",
        "          if (!hasForeignProvenance(operand, index) && !isPlaceholderAttribute(node)) {",
        "          if (!isPlaceholderAttribute(node)) {",
        "script",
        ["S-N2-foreign-provenance", "S-N6-parenthesised-foreign-alias"],
        "★ R3: without the binding lookup this leg is an ESLint selector again. "
        "Both Theme cases go, which is the point: the exemption is one rule, not "
        "one case.",
    ),
    Mutation(
        "M9-literal-contains",
        "gate",
        "    SYSTEM_LITERALS.has(node.text)",
        "    [...SYSTEM_LITERALS].some((s) => (node.text ?? '').includes(s))",
        "script",
        ["S-N3-near-miss-literal"],
        "the literal must match exactly, not merely contain the word",
    ),
    Mutation(
        "M10a-drop-same-line-pragma",
        "gate",
        "    if (EXEMPT_PRAGMA.test(lines[line - 1] ?? '') || EXEMPT_PRAGMA.test(lines[line - 2] ?? '')) {",
        "    if (EXEMPT_PRAGMA.test(lines[line - 2] ?? '')) {",
        "script",
        ["S-N4-pragma"],
        "R4 requires the escape hatch, so each of its two positions needs a test",
    ),
    Mutation(
        "M10b-drop-line-above-pragma",
        "gate",
        "    if (EXEMPT_PRAGMA.test(lines[line - 1] ?? '') || EXEMPT_PRAGMA.test(lines[line - 2] ?? '')) {",
        "    if (EXEMPT_PRAGMA.test(lines[line - 1] ?? '')) {",
        "script",
        ["S-N4-pragma"],
        "the first version of this mutation disabled only the other position and "
        "flipped nothing, which is what a corpus covering one position looks like",
    ),
    Mutation(
        "M32-pragma-without-reason",
        "gate",
        "const EXEMPT_PRAGMA = /(?:^|\\s)\\/\\/\\s*units-exempt:\\s*\\S/",
        "const EXEMPT_PRAGMA = /units-exempt/",
        "script",
        ["S-P22-bare-pragma"],
        "the docstring and the failure message both promise a reason",
    ),
    Mutation(
        "M38-any-unit-member-flags",
        "gate",
        "  if (significant.includes('foreign')) return 'foreign'",
        "  if (false) return 'foreign'",
        "script",
        ["S-N2-foreign-provenance", "S-N6-parenthesised-foreign-alias"],
        "★ the reviewer's LITERAL rule, built and run: foreign only when no member "
        "is a unit system. It flips `type Theme = 'light' | 'dark' | 'imperial'`, "
        "which R2 requires to be accepted and R3 names as the case this leg exists "
        "to distinguish. That is why the shipped rule rounds the other way.",
    ),
    Mutation(
        "M40-drop-paren-stripping",
        "gate",
        "  while (out.startsWith('(') && out.endsWith(')')) {",
        "  while (false) {",
        "script",
        ["S-N6-parenthesised-foreign-alias"],
        "paren stripping can only be pinned from the NEGATIVE side: removing it "
        "makes the gate stricter, so no positive can flip",
    ),
    Mutation(
        "M11-flag-every-equality",
        "gate",
        "        if (rightIsLiteral || leftIsLiteral) {",
        "        if (true) {",
        "script",
        ["S-N3-near-miss-literal", "S-N5-positive-control"],
        "★ T4-R7's mirror: a guard that fires unconditionally looks healthier "
        "than one that never fires and is worth exactly as much",
    ),
    # ---------------- ESLint leg ---------------------------------------------
    Mutation(
        "M12-drop-named-list",
        "config",
        "'Literal[raw=/^(?:1609\\\\.34|25\\\\.4|235\\\\.214|282\\\\.481)$/]'",
        "'Literal[raw=/^(?:__never__)$/]'",
        "eslint",
        [
            "E-P1-metres-per-mile",
            "E-P3-mm-per-inch",
            "E-P4-mpg-to-l100km",
            "E-P9-uk-mpg-factor",
        ],
        "the low-precision factors are invisible to the precision rule",
    ),
    Mutation(
        "M33-drop-uk-mpg-from-named-list",
        "config",
        "|282\\\\.481)$/]",
        ")$/]",
        "eslint",
        ["E-P9-uk-mpg-factor"],
        "one factor at a time: dropping the whole list is not the same experiment",
    ),
    Mutation(
        "M21-narrow-precision-threshold",
        "config",
        "'Literal[raw=/^\\\\d+\\\\.\\\\d{4,}$/]'",
        "'Literal[raw=/^\\\\d+\\\\.\\\\d{7,}$/]'",
        "eslint",
        ["E-P2-litres-per-gallon", "E-P5-bar-to-psi", "E-P6-unlisted-factor"],
        "four digits is the line between a factor and a UI constant",
    ),
    Mutation(
        "M13-widen-precision-threshold",
        "config",
        "'Literal[raw=/^\\\\d+\\\\.\\\\d{4,}$/]'",
        "'Literal[raw=/^\\\\d+\\\\.\\\\d{3,}$/]'",
        "eslint",
        [
            "E-N1-propane-density",
            "E-N3-ordinary-ui-numbers",
            "E-P4-mpg-to-l100km",
            "E-P9-uk-mpg-factor",
        ],
        "★ R5: this is the widening that would flag the propane density, which "
        "is correct code that codex hard-reviewed twice",
    ),
    Mutation(
        "M14-drop-cf-idiom",
        "config",
        "[left.operator='/'][left.right.value=5]",
        "[left.operator='/'][left.right.value=5555]",
        "eslint",
        ["E-P7-c-to-f-ninths"],
        "R7: the idiom carries no constant distinctive enough to list",
    ),
    Mutation(
        "M14b-drop-cf-decimal-idiom",
        "config",
        "[left.operator='*'][left.right.value=1.8]",
        "[left.operator='*'][left.right.value=1.8888]",
        "eslint",
        ["E-P8-c-to-f-decimal"],
        "the same conversion spelled with 1.8",
    ),
    Mutation(
        "M15-match-value-not-raw",
        "config",
        "'Literal[raw=/^\\\\d+\\\\.\\\\d{4,}$/]'",
        "'Literal[value=/^\\\\d+\\\\.\\\\d{4,}$/]'",
        "eslint",
        [
            "E-N2-string-that-looks-like-a-factor",
            "E-P2-litres-per-gallon",
            "E-P5-bar-to-psi",
            "E-P6-unlisted-factor",
        ],
        "a string's value looks exactly like a factor and its raw text does not, "
        "and esquery does not coerce a number to match a regex, so this breaks "
        "the rule in both directions at once",
    ),
    Mutation(
        "M34-drop-i18n-spread",
        "config",
        "'no-restricted-syntax': ['error', ...I18N_RESTRICTED, ...UNIT_CONSTANT_RESTRICTED],",
        "'no-restricted-syntax': ['error', ...UNIT_CONSTANT_RESTRICTED],",
        "eslint",
        ["E-P10-i18n-guard-survives-scoping"],
        "★ the exact regression the hoisting comment claims to prevent: a later "
        "config object REPLACES a rule's options rather than merging into them",
    ),
    Mutation(
        "M16-flag-every-number",
        "config",
        "'Literal[raw=/^\\\\d+\\\\.\\\\d{4,}$/]'",
        "'Literal[raw=/^\\\\d+(?:\\\\.\\\\d+)?$/]'",
        "eslint",
        [
            "E-N1-propane-density",
            "E-N3-ordinary-ui-numbers",
            "E-N4-positive-control",
            "E-P1-metres-per-mile",
            "E-P3-mm-per-inch",
            "E-P4-mpg-to-l100km",
            "E-P7-c-to-f-ninths",
            "E-P8-c-to-f-decimal",
            "E-P9-uk-mpg-factor",
        ],
        "★ T4-R7's mirror on the ESLint leg: every ordinary number becomes a "
        "finding and every real factor is reported twice",
    ),
]

# M42 makes the gate refuse every file, so it flips every script case by
# construction. Derived, never typed out: this phase has now twice been bitten by
# a hardcoded expectation that went stale one argument over.
for _m in MUTATIONS:
    if _m.mid == "M42-no-parse-diagnostics-property":
        _m.flips = [c.cid for c in C.SCRIPT_POSITIVE + C.SCRIPT_NEGATIVE]

# Mutations of the tree WALK rather than the scan. `walkDir` is unreachable from
# `--scan`, so the corpus cannot see these at all: they are scored against an
# owned fixture tree via `--src`.
WALK_MUTATIONS = [
    (
        "M35-drop-dts-exclusion",
        "      !entry.endsWith('.d.ts')\n",
        "      true\n",
        "types.d.ts",
        "a declaration file holds types, not decisions",
    ),
    (
        "M36-drop-test-file-exclusion",
        "      !entry.endsWith('.test.ts') &&\n      !entry.endsWith('.test.tsx') &&\n",
        "",
        "b.test.ts",
        "tests mock both systems on purpose; including them drowns the work list",
    ),
    (
        "M37-drop-tests-dir-exclusion",
        "      if (entry === '__tests__' || entry === 'node_modules') continue\n",
        "",
        "__tests__/t.ts",
        "same reasoning, one directory over",
    ),
]


def write_mutant(
    target: str, old: str, new: str, also: list[tuple[str, str]] | None = None
) -> tuple[Path, int]:
    """Write a mutated COPY and return (path, the WORST occurrence count seen).

    Every edit must match exactly once. Returning the worst count rather than
    the first keeps the PATTERN guard meaningful for multi-edit mutations: a
    combined mutation whose second edit silently matched nothing would otherwise
    be scored as though it had applied.
    """
    src = GATE_SRC if target == "gate" else ESLINT_CFG
    dst = GATE_MUTANT if target == "gate" else CFG_MUTANT
    text = src.read_text()
    worst = 1
    for a, b in [(old, new), *(also or [])]:
        n = text.count(a)
        if n != 1:
            worst = n
            break
        text = text.replace(a, b)
    if worst == 1:
        dst.write_text(text)
    return dst, worst


def mutant_is_valid(target: str, tmpdir: Path, expect_probe: str = "clean") -> str | None:
    """Prove the mutant still RUNS before its result is allowed to mean anything.

    Round 1 of the sibling mutation harness scored a syntax-broken mutant as a
    clean survivor. Here the mirror risk is worse: a mutant that fails to run
    flips every case at once and reads as a successful wide mutation.
    """
    probe = tmpdir / "validity_probe.tsx"
    probe.write_text(VALIDITY_PROBE)
    if target == "gate":
        p = subprocess.run(
            [
                "bun",
                "run",
                str(GATE_MUTANT.relative_to(FRONTEND)),
                "--scan",
                str(probe),
            ],
            cwd=FRONTEND,
            capture_output=True,
            text=True,
        )
        if expect_probe == "refuses":
            # The mutation's whole point is that the gate now refuses every
            # file. It must still refuse with its OWN message rather than
            # crashing, or it is broken rather than deliberately strict.
            if p.returncode == 0:
                return "mutant was expected to refuse and did not"
            if "parseDiagnostics" not in (p.stderr or p.stdout):
                return f"mutant crashed instead of refusing: {(p.stderr or p.stdout).strip()[-200:]}"
            return None
        if p.returncode != 0:
            return f"mutant does not run: {(p.stderr or p.stdout).strip()[-200:]}"
        try:
            if json.loads(p.stdout)["findings"]:
                return "mutant reports findings on an input with none"
        except (json.JSONDecodeError, KeyError):
            return f"mutant emitted non-JSON: {p.stdout.strip()[:200]}"
        return None
    p = subprocess.run(
        [
            "bunx",
            "eslint",
            "--format",
            "json",
            "--config",
            str(CFG_MUTANT.relative_to(FRONTEND)),
            str(probe),
        ],
        cwd=FRONTEND,
        capture_output=True,
        text=True,
    )
    try:
        payload = json.loads(p.stdout)
    except json.JSONDecodeError:
        return f"mutated config does not load: {(p.stderr or p.stdout).strip()[-200:]}"
    if any(
        m.get("ruleId") == "no-restricted-syntax"
        for f in payload
        for m in f["messages"]
    ):
        return "mutated config reports findings on an input with none"
    return None


def run_leg(
    leg: str, tmpdir: Path, mutated: str | None = None
) -> dict[str, tuple[int, list[str]]]:
    """Run every case of one leg and return {case id: (count, detail)}."""
    cases = (
        C.SCRIPT_POSITIVE + C.SCRIPT_NEGATIVE
        if leg == "script"
        else C.ESLINT_POSITIVE + C.ESLINT_NEGATIVE
    )
    out: dict[str, tuple[int, list[str]]] = {}
    for case in cases:
        if leg == "script":
            gate = mutated or C.GATE
            out[case.cid] = C.run_script_leg(case, tmpdir, gate)
        else:
            out[case.cid] = C.run_eslint_leg(case, mutated)
    return out


def eslint_messages(path: Path, config: str | None = None) -> list[str]:
    argv = ["bunx", "eslint", "--format", "json"]
    if config is not None:
        argv += ["--config", config]
    p = subprocess.run([*argv, str(path)], cwd=FRONTEND, capture_output=True, text=True)
    try:
        payload = json.loads(p.stdout)
    except json.JSONDecodeError:
        return [f"eslint emitted non-JSON: {(p.stdout or p.stderr).strip()[:200]}"]
    return [
        m["message"]
        for f in payload
        for m in f["messages"]
        if m.get("ruleId") == "no-restricted-syntax"
    ]


def scope_proof() -> list[str]:
    """T4-R6: the `files:` scope is real, both directions, and names real files."""
    failures: list[str] = []
    SCOPE_FIXTURE.write_text("export const METRES_PER_MILE = 1609.34\n")
    try:
        outside = eslint_messages(SCOPE_FIXTURE)
        if outside:
            failures.append(f"scope: an UNSCOPED file was linted anyway: {outside}")
        print(
            f"  scope OUTSIDE  {'silent' if not outside else '*** LOUD ***'}"
            "   an unmigrated path keeps its raw factor without failing CI"
        )

        anchor = "  'scripts/__units_corpus__.tsx',\n"
        original = ESLINT_CFG.read_text()
        if anchor not in original:
            failures.append("scope: the corpus anchor is missing from eslint.config.js")
            return failures
        CFG_MUTANT.write_text(
            original.replace(
                anchor, anchor + "  'scripts/__units_scope_probe__.tsx',\n"
            )
        )
        inside = eslint_messages(SCOPE_FIXTURE, str(CFG_MUTANT.relative_to(FRONTEND)))
        if len(inside) != 1 or "Raw unit-conversion constant" not in inside[0]:
            failures.append(f"scope: a SCOPED file was not flagged: {inside}")
        print(
            f"  scope INSIDE   {'fired' if inside else '*** SILENT ***'}"
            f"     {inside[0][:60] if inside else 'nothing reported'}"
        )

        # ESLint never warns about a `files:` entry that matches nothing, so a
        # typo silently un-scopes one file. That is the T4-R6 defect one level
        # down, and the fixture above cannot see it.
        block = re.search(r"const UNITS_MIGRATED_FILES = \[(.*?)\n\]", original, re.S)
        if block is None:
            failures.append("scope: could not read UNITS_MIGRATED_FILES")
            return failures
        # Only lines that are exactly `  'path',`. Matching every quoted run
        # instead pulled apostrophes out of the comment prose above the array
        # and reported "the corpus's own fixture path..." as a missing file.
        entries = re.findall(r"^\s*'([^']+)',\s*$", block.group(1), re.M)
        missing = [
            e
            for e in entries
            if e != "scripts/__units_corpus__.tsx" and not (FRONTEND / e).exists()
        ]
        if missing:
            failures.append(
                f"scope: {len(missing)} entry/entries name no file: {missing}"
            )
        print(
            f"  scope ENTRIES  {'all real' if not missing else '*** MISSING ***'}"
            f"    {len(entries)} paths, {len(missing)} that name nothing"
        )
    finally:
        SCOPE_FIXTURE.unlink(missing_ok=True)
        CFG_MUTANT.unlink(missing_ok=True)
    return failures


def run_gate(baseline: Path, src: Path, gate: Path = GATE_SRC) -> tuple[int, str]:
    p = subprocess.run(
        [
            "bun",
            "run",
            str(gate.relative_to(FRONTEND)),
            "--baseline",
            str(baseline),
            "--src",
            str(src),
        ],
        cwd=FRONTEND,
        capture_output=True,
        text=True,
    )
    return p.returncode, (p.stdout + p.stderr)


ONE_COMPARISON = (
    "import { useUnitPreference } from '@/hooks/useUnitPreference'\n"
    "export function a(): string {\n"
    "  const { system } = useUnitPreference()\n"
    "  return system === 'imperial' ? 'mi' : 'km'\n"
    "}\n"
)


def baseline_proof(tmpdir: Path) -> list[str]:
    """R4: the baseline counts occurrences; set membership lets a duplicate pass."""
    failures: list[str] = []
    tree = tmpdir / "baseline_tree"
    tree.mkdir()
    baseline = tmpdir / "units.baseline.probe.json"
    (tree / "a.ts").write_text(ONE_COMPARISON)
    try:
        subprocess.run(
            [
                "bun",
                "run",
                "scripts/validate-units.ts",
                "--update",
                "--baseline",
                str(baseline),
                "--src",
                str(tree),
            ],
            cwd=FRONTEND,
            capture_output=True,
            text=True,
            check=True,
        )
        rc, out = run_gate(baseline, tree)
        if rc != 0:
            failures.append(
                f"baseline: a freshly written baseline did not pass: {out[:200]}"
            )
        print(f"  baseline SAME  {'passes' if rc == 0 else '*** FAILS ***'}")

        # The duplicate. Same file, same expression, one more occurrence.
        (tree / "a.ts").write_text(
            ONE_COMPARISON + "export function b(): string {\n"
            "  const { system } = useUnitPreference()\n"
            "  return system === 'imperial' ? 'mi' : 'km'\n"
            "}\n"
        )
        rc, out = run_gate(baseline, tree)
        ok = rc == 1 and "1 new unit-system branch" in out
        if not ok:
            failures.append(
                f"baseline: a DUPLICATE occurrence did not fail: rc={rc} {out[:200]}"
            )
        print(f"  baseline DUP   {'fails as it must' if ok else '*** PASSED ***'}")

        # ...and the same duplicate under the set-keyed model the ruling rejects.
        dst, n = write_mutant(
            "gate",
            "    .filter(([key, count]) => count > (allowed.get(key) ?? 0))",
            "    .filter(([key]) => !allowed.has(key))",
        )
        if n != 1:
            failures.append(
                f"baseline: set-keying mutation matched {n} times, expected 1"
            )
        else:
            rc, _ = run_gate(baseline, tree, dst)
            if rc != 0:
                failures.append(
                    "baseline: set-keying was expected to MISS the duplicate"
                )
            print(
                f"  baseline SET   {'misses it, as the ruling says' if rc == 0 else '*** caught ***'}"
                "   <- the hole R4 exists to close"
            )
    finally:
        GATE_MUTANT.unlink(missing_ok=True)
    return failures


def walk_proof(tmpdir: Path) -> list[str]:
    """The tree walk's exclusions, which `--scan` can never reach."""
    failures: list[str] = []
    tree = tmpdir / "walk_tree"
    (tree / "__tests__").mkdir(parents=True)
    (tree / "a.ts").write_text(ONE_COMPARISON)
    (tree / "types.d.ts").write_text(ONE_COMPARISON)
    (tree / "b.test.ts").write_text(ONE_COMPARISON)
    (tree / "__tests__" / "t.ts").write_text(ONE_COMPARISON)
    baseline = tmpdir / "walk.baseline.json"

    def scanned(gate: Path) -> set[str]:
        subprocess.run(
            [
                "bun",
                "run",
                str(gate.relative_to(FRONTEND)),
                "--update",
                "--baseline",
                str(baseline),
                "--src",
                str(tree),
            ],
            cwd=FRONTEND,
            capture_output=True,
            text=True,
            check=True,
        )
        return {
            e["file"].split("walk_tree/")[-1] for e in json.loads(baseline.read_text())
        }

    try:
        base = scanned(GATE_SRC)
        ok = base == {"a.ts"}
        if not ok:
            failures.append(
                f"walk: expected only a.ts to be scanned, got {sorted(base)}"
            )
        print(
            f"  walk BASE      {'a.ts only' if ok else '*** ' + str(sorted(base)) + ' ***'}"
        )

        for mid, old, new, expected_file, why in WALK_MUTATIONS:
            dst, n = write_mutant("gate", old, new)
            if n != 1:
                failures.append(f"{mid}: PATTERN occurs {n} times, expected 1")
                print(f"  {mid:<32} *** NOT A VALID MUTANT ***")
                continue
            bad = mutant_is_valid("gate", tmpdir)
            if bad:
                failures.append(f"{mid}: {bad}")
                print(f"  {mid:<32} *** MUTANT DID NOT RUN *** {bad}")
                GATE_MUTANT.unlink(missing_ok=True)
                continue
            got = scanned(dst)
            GATE_MUTANT.unlink(missing_ok=True)
            gained = got - base
            ok = gained == {expected_file}
            if not ok:
                failures.append(
                    f"{mid}: expected to gain {expected_file}, gained {sorted(gained)}"
                )
            print(
                f"  {mid:<32} {'gains ' + expected_file if ok else '*** ' + str(sorted(gained)) + ' ***'}"
            )
    finally:
        GATE_MUTANT.unlink(missing_ok=True)
    return failures


def main() -> int:
    # ★ Round 4 replaced a start-time CLEANUP with a start-time REFUSAL.
    # Deleting leftovers meant a concurrent corpus run had its fixture removed
    # underneath it, so each run could report a result reflecting a file it did
    # not write. A wrong answer is worse than a manual cleanup, and the corpus
    # now runs inside `validate:translations`, so every local
    # `bin/ci-check --frontend` is a candidate for that collision.
    refusal = C.acquire_lock(
        "units_gate_selftest.py",
        [GATE_MUTANT, CFG_MUTANT, SCOPE_FIXTURE, C.ESLINT_FIXTURE],
    )
    if refusal:
        print(refusal)
        return 2
    failures: list[str] = []
    tmpdir = Path(tempfile.mkdtemp(prefix="units-selftest-"))
    try:
        print("deriving reference results from the unmutated gate")
        reference = {
            "script": run_leg("script", tmpdir),
            "eslint": run_leg("eslint", tmpdir),
        }
        for leg, results in reference.items():
            cases = (
                C.SCRIPT_POSITIVE + C.SCRIPT_NEGATIVE
                if leg == "script"
                else C.ESLINT_POSITIVE + C.ESLINT_NEGATIVE
            )
            for case in cases:
                bad = C.check(case, *results[case.cid])
                if bad:
                    failures.append(f"reference {case.cid}: {bad}")
        if failures:
            print("the corpus is not green, so no mutation result would mean anything:")
            for f in failures:
                print("  " + f)
            return 1
        print(
            f"  {len(reference['script'])} script cases + {len(reference['eslint'])} "
            "ESLint cases, all as documented\n"
        )

        print("mutations: each must RUN, then flip exactly the cases that name it")
        print("-" * 78)
        for mut in MUTATIONS:
            dst, n = write_mutant(mut.target, mut.old, mut.new, mut.also)
            if n != 1:
                failures.append(f"{mut.mid}: PATTERN occurs {n} times, expected 1")
                print(
                    f"  {mut.mid:<32} *** NOT A VALID MUTANT *** pattern occurs {n} times"
                )
                continue
            try:
                bad = mutant_is_valid(mut.target, tmpdir, mut.expect_probe)
                if bad:
                    failures.append(f"{mut.mid}: {bad}")
                    print(f"  {mut.mid:<32} *** MUTANT DID NOT RUN *** {bad}")
                    continue
                got = run_leg(mut.leg, tmpdir, str(dst.relative_to(FRONTEND)))
            finally:
                dst.unlink(missing_ok=True)
            flipped = sorted(
                cid for cid, r in got.items() if r != reference[mut.leg][cid]
            )
            expected = sorted(mut.flips)
            ok = flipped == expected
            if not ok:
                failures.append(
                    f"{mut.mid}: expected to flip {expected}, flipped {flipped}"
                )
            print(
                f"  {mut.mid:<32} "
                + (
                    f"flips {len(expected)}: {','.join(expected)}"
                    if ok
                    else f"*** WRONG CASES FLIPPED *** {flipped}"
                )
            )

        print("\nT4-R6: the ESLint leg's files: scope, proved three ways")
        print("-" * 78)
        failures += scope_proof()

        print("\nThe tree walk, which --scan cannot reach")
        print("-" * 78)
        failures += walk_proof(tmpdir)

        print("\nR4: the baseline counts occurrences rather than storing a set")
        print("-" * 78)
        failures += baseline_proof(tmpdir)
    finally:
        for leftover in (GATE_MUTANT, CFG_MUTANT, SCOPE_FIXTURE, C.ESLINT_FIXTURE):
            leftover.unlink(missing_ok=True)
        shutil.rmtree(tmpdir, ignore_errors=True)
        C.release_lock()

    print()
    if failures:
        print("SELFTEST: FAILURES")
        for f in failures:
            print("  " + f)
        return 1
    print(
        f"SELFTEST: all {len(MUTATIONS)} scan mutations and {len(WALK_MUTATIONS)} walk "
        "mutations ran and flipped exactly their own cases; the scope holds in "
        "both directions and names only real files; the baseline counts; and both "
        "positive controls stayed silent on correct code"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
