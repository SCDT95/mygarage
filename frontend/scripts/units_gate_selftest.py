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

Three more things it proves, each demanded by a ruling:

  T4-R6  the ESLint leg's `files:` scope is real. A fixture holding a genuine
         conversion factor is silent OUTSIDE the scope and loud INSIDE it, so
         the scoped rule cannot be silently matching nothing.
  R4     the baseline is keyed by occurrence COUNT and not by set membership.
         A second copy of an already-baselined expression FAILS, and under the
         set-keyed mutation it passes, which is the hole the ruling exists to
         close.
  T4-R7  a guard that fires unconditionally is as worthless as one that never
         fires, and looks healthier. Both legs carry a positive control that
         must stay silent on correct code, and each is flipped by a mutation
         that makes its leg over-fire.

★ Every fixture is OWNED by the corpus module. Nothing here patches a
production line, because the gate's subject is the whole of `frontend/src` and
any line in it is a fixture the subject is free to delete. That is how
`mutation_harness_selftest.py`'s first version rotted.

The reference results are DERIVED by running the corpus once, never passed in:
the same harness was being handed a stale test total on the command line for
three tasks after the suite moved past it.

Usage::

    python3 frontend/scripts/units_gate_selftest.py

Exit code: 1 if any mutation fails to flip exactly the cases that name it.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass
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

# Fixtures this file owns outright, created and removed per run.
SCOPE_FIXTURE = FRONTEND / "src/__units_scope_probe__.tsx"
BASELINE_FIXTURE = FRONTEND / "src/__units_baseline_probe__.tsx"


@dataclass
class Mutation:
    """One deliberate defect in the gate, and the corpus cases it must flip."""

    mid: str
    path: Path
    old: str
    new: str
    leg: str
    flips: list[str]
    why: str


MUTATIONS = [
    # ---------------- script leg: what the detector must catch ----------------
    Mutation(
        "M17-drop-imperial-literal",
        GATE_SRC,
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
        ],
        "half the vocabulary is half the gate: every imperial case goes quiet, "
        "and the switch drops from two findings to one",
    ),
    Mutation(
        "M20-drop-metric-literal",
        GATE_SRC,
        "const SYSTEM_LITERALS = new Set(['imperial', 'metric'])",
        "const SYSTEM_LITERALS = new Set(['imperial'])",
        "script",
        ["S-P2-eq-metric", "S-P5-switch", "S-P9-displaySystem"],
        "R2: v1 prohibited only the imperial half and production uses both",
    ),
    Mutation(
        "M1-drop-yoda",
        GATE_SRC,
        "        const leftIsLiteral = isSystemLiteral(node.left)",
        "        const leftIsLiteral = false",
        "script",
        ["S-P3-yoda"],
        "a literal-on-the-left comparison is the same decision",
    ),
    Mutation(
        "M2-drop-neq",
        GATE_SRC,
        "  ts.SyntaxKind.ExclamationEqualsEqualsToken,\n  ts.SyntaxKind.EqualsEqualsToken,",
        "  ts.SyntaxKind.EqualsEqualsToken,",
        "script",
        ["S-P4-neq"],
        "negation is not an escape hatch",
    ),
    Mutation(
        "M3-drop-switch",
        GATE_SRC,
        "    if (node.kind === ts.SyntaxKind.CaseClause && isSystemLiteral(node.expression)) {",
        "    if (false && node.kind === ts.SyntaxKind.CaseClause) {",
        "script",
        ["S-P5-switch"],
        "a switch is a branch wearing different punctuation",
    ),
    Mutation(
        "M18-skip-variable-initialisers",
        GATE_SRC,
        "    ts.forEachChild(node, walk)\n  }\n\n  walk(sf)",
        "    if (node.kind === ts.SyntaxKind.VariableDeclaration) return\n"
        "    ts.forEachChild(node, walk)\n  }\n\n  walk(sf)",
        "script",
        ["S-P6-aliased-boolean"],
        "a walker that stops short of initialisers misses the aliased boolean",
    ),
    Mutation(
        "M19-key-on-identifier-name",
        GATE_SRC,
        "          if (!hasForeignProvenance(operand, declared) && !isPlaceholderAttribute(node)) {",
        "          if (operand.text === 'system' && !isPlaceholderAttribute(node)) {",
        "script",
        [
            "S-P7-destructuring-rename",
            "S-P8-resolvedSystem",
            "S-P9-displaySystem",
            "S-P10-member-expression",
        ],
        "★ R2's forbidden implementation: it passes every case that spells the "
        "variable `system` and misses both spellings production actually uses",
    ),
    Mutation(
        "M6-string-is-foreign",
        GATE_SRC,
        "/\\b(UnitSystem|string|any|unknown)\\b|'(imperial|metric)'/",
        "/\\b(UnitSystem)\\b|'(imperial|metric)'/",
        "script",
        ["S-P9-displaySystem"],
        "`: string` would otherwise be a one-word way to switch the gate off",
    ),
    Mutation(
        "M4-unresolved-is-exempt",
        GATE_SRC,
        "  if (operand.kind !== ts.SyntaxKind.Identifier) return false",
        "  if (operand.kind !== ts.SyntaxKind.Identifier) return true",
        "script",
        ["S-P10-member-expression"],
        "fail-open on an unresolvable operand is how a gate becomes a floor",
    ),
    Mutation(
        "M5-unitsystem-is-foreign",
        GATE_SRC,
        "/\\b(UnitSystem|string|any|unknown)\\b|'(imperial|metric)'/",
        "/\\b(string|any|unknown)\\b|'(imperial|metric)'/",
        "script",
        ["S-P11-annotated-unitsystem"],
        "the annotation exemption must not swallow the annotation that proves it",
    ),
    # ---------------- script leg: what the detector must NOT catch -----------
    Mutation(
        "M7-drop-placeholder-exemption",
        GATE_SRC,
        "&& !isPlaceholderAttribute(node)",
        "",
        "script",
        ["S-N1-placeholder"],
        "R5: a placeholder is an example value, and flagging it flags correct code",
    ),
    Mutation(
        "M8-drop-annotation-exemption",
        GATE_SRC,
        "          if (!hasForeignProvenance(operand, declared) && !isPlaceholderAttribute(node)) {",
        "          if (!isPlaceholderAttribute(node)) {",
        "script",
        ["S-N2-foreign-provenance"],
        "★ R3: without the binding lookup this leg is an ESLint selector again",
    ),
    Mutation(
        "M9-literal-contains",
        GATE_SRC,
        "    SYSTEM_LITERALS.has(node.text)",
        "    [...SYSTEM_LITERALS].some((s) => (node.text ?? '').includes(s))",
        "script",
        ["S-N3-near-miss-literal"],
        "the literal must match exactly, not merely contain the word",
    ),
    Mutation(
        "M10a-drop-same-line-pragma",
        GATE_SRC,
        "      (lines[line - 1] ?? '').includes('units-exempt') ||",
        "      false ||",
        "script",
        ["S-N4-pragma"],
        "R4 requires the escape hatch, so each of its two positions needs a test",
    ),
    Mutation(
        "M10b-drop-line-above-pragma",
        GATE_SRC,
        "      (lines[line - 2] ?? '').includes('units-exempt')",
        "      false",
        "script",
        ["S-N4-pragma"],
        "the first version of this mutation disabled only the other position "
        "and flipped nothing, which is what a corpus covering one position looks like",
    ),
    Mutation(
        "M11-flag-every-equality",
        GATE_SRC,
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
        ESLINT_CFG,
        "'Literal[raw=/^(?:1609\\\\.34|25\\\\.4|235\\\\.214|282\\\\.481)$/]'",
        "'Literal[raw=/^(?:__never__)$/]'",
        "eslint",
        ["E-P1-metres-per-mile", "E-P3-mm-per-inch", "E-P4-mpg-to-l100km"],
        "the low-precision factors are invisible to the precision rule",
    ),
    Mutation(
        "M21-narrow-precision-threshold",
        ESLINT_CFG,
        "'Literal[raw=/^\\\\d+\\\\.\\\\d{4,}$/]'",
        "'Literal[raw=/^\\\\d+\\\\.\\\\d{7,}$/]'",
        "eslint",
        ["E-P2-litres-per-gallon", "E-P5-bar-to-psi", "E-P6-unlisted-factor"],
        "four digits is the line between a factor and a UI constant",
    ),
    Mutation(
        "M13-widen-precision-threshold",
        ESLINT_CFG,
        "'Literal[raw=/^\\\\d+\\\\.\\\\d{4,}$/]'",
        "'Literal[raw=/^\\\\d+\\\\.\\\\d{3,}$/]'",
        "eslint",
        ["E-N1-propane-density", "E-N3-ordinary-ui-numbers", "E-P4-mpg-to-l100km"],
        "★ R5: this is the widening that would flag the propane density, which "
        "is correct code that codex hard-reviewed twice",
    ),
    Mutation(
        "M14-drop-cf-idiom",
        ESLINT_CFG,
        "[left.operator='/'][left.right.value=5]",
        "[left.operator='/'][left.right.value=5555]",
        "eslint",
        ["E-P7-c-to-f-ninths"],
        "R7: the idiom carries no constant distinctive enough to list",
    ),
    Mutation(
        "M14b-drop-cf-decimal-idiom",
        ESLINT_CFG,
        "[left.operator='*'][left.right.value=1.8]",
        "[left.operator='*'][left.right.value=1.8888]",
        "eslint",
        ["E-P8-c-to-f-decimal"],
        "the same conversion spelled with 1.8",
    ),
    Mutation(
        "M15-match-value-not-raw",
        ESLINT_CFG,
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
        "M16-flag-every-number",
        ESLINT_CFG,
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
        ],
        "★ T4-R7's mirror on the ESLint leg: every ordinary number becomes a "
        "finding and every real factor is reported twice",
    ),
]


def run_leg(leg: str, tmpdir: Path) -> dict[str, tuple[int, list[str]]]:
    """Run every case of one leg and return {case id: (count, detail)}."""
    cases = (
        C.SCRIPT_POSITIVE + C.SCRIPT_NEGATIVE
        if leg == "script"
        else C.ESLINT_POSITIVE + C.ESLINT_NEGATIVE
    )
    out: dict[str, tuple[int, list[str]]] = {}
    for case in cases:
        if leg == "script":
            out[case.cid] = C.run_script_leg(case, tmpdir)
        else:
            out[case.cid] = C.run_eslint_leg(case)
    return out


def scope_proof() -> list[str]:
    """T4-R6: the ESLint leg's `files:` scope is real, in both directions."""
    failures: list[str] = []
    body = "export const METRES_PER_MILE = 1609.34\n"
    SCOPE_FIXTURE.write_text(body)
    original = ESLINT_CFG.read_text()
    try:
        outside = eslint_messages(SCOPE_FIXTURE)
        if outside:
            failures.append(f"scope: an UNSCOPED file was linted anyway: {outside}")
        print(
            f"  scope OUTSIDE  {'silent' if not outside else '*** LOUD ***'}"
            "   an unmigrated path keeps its raw factor without failing CI"
        )

        anchor = "  'src/__units_corpus__.tsx',\n"
        assert anchor in original, "scope anchor not found in eslint.config.js"
        ESLINT_CFG.write_text(
            original.replace(anchor, anchor + "  'src/__units_scope_probe__.tsx',\n")
        )
        inside = eslint_messages(SCOPE_FIXTURE)
        if len(inside) != 1 or "Raw unit-conversion constant" not in inside[0]:
            failures.append(f"scope: a SCOPED file was not flagged: {inside}")
        print(
            f"  scope INSIDE   {'fired' if inside else '*** SILENT ***'}"
            f"     {inside[0][:64] if inside else 'nothing reported'}"
        )
    finally:
        ESLINT_CFG.write_text(original)
        SCOPE_FIXTURE.unlink(missing_ok=True)
    return failures


def eslint_messages(path: Path) -> list[str]:
    p = subprocess.run(
        ["bunx", "eslint", "--format", "json", str(path)],
        cwd=FRONTEND,
        capture_output=True,
        text=True,
    )
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


def run_gate(baseline: Path) -> tuple[int, str]:
    p = subprocess.run(
        ["bun", "run", "scripts/validate-units.ts", "--baseline", str(baseline)],
        cwd=FRONTEND,
        capture_output=True,
        text=True,
    )
    return p.returncode, (p.stdout + p.stderr)


def baseline_proof(tmpdir: Path) -> list[str]:
    """R4: the baseline counts occurrences; set membership lets a duplicate pass."""
    failures: list[str] = []
    baseline = tmpdir / "units.baseline.probe.json"
    one = (
        "import { useUnitPreference } from '@/hooks/useUnitPreference'\n"
        "export function a(): string {\n"
        "  const { system } = useUnitPreference()\n"
        "  return system === 'imperial' ? 'mi' : 'km'\n"
        "}\n"
    )
    two = one + (
        "export function b(): string {\n"
        "  const { system } = useUnitPreference()\n"
        "  return system === 'imperial' ? 'mi' : 'km'\n"
        "}\n"
    )
    original = GATE_SRC.read_text()
    BASELINE_FIXTURE.write_text(one)
    try:
        subprocess.run(
            [
                "bun",
                "run",
                "scripts/validate-units.ts",
                "--update",
                "--baseline",
                str(baseline),
            ],
            cwd=FRONTEND,
            capture_output=True,
            text=True,
            check=True,
        )
        rc, out = run_gate(baseline)
        if rc != 0:
            failures.append(
                f"baseline: a freshly written baseline did not pass: {out[:200]}"
            )
        print(f"  baseline SAME  {'passes' if rc == 0 else '*** FAILS ***'}")

        # The duplicate. Same file, same expression, one more occurrence.
        BASELINE_FIXTURE.write_text(two)
        rc, out = run_gate(baseline)
        ok = rc == 1 and "1 new unit-system branch" in out
        if not ok:
            failures.append(
                f"baseline: a DUPLICATE occurrence did not fail: rc={rc} {out[:200]}"
            )
        print(f"  baseline DUP   {'fails as it must' if ok else '*** PASSED ***'}")

        # ...and the same duplicate under the set-keyed model the ruling rejects.
        GATE_SRC.write_text(
            original.replace(
                "    .filter(([key, count]) => count > (allowed.get(key) ?? 0))",
                "    .filter(([key]) => !allowed.has(key))",
            )
        )
        rc, _ = run_gate(baseline)
        if rc != 0:
            failures.append("baseline: set-keying was expected to MISS the duplicate")
        print(
            f"  baseline SET   {'misses it, as the ruling says' if rc == 0 else '*** caught ***'}"
            "   <- the hole R4 exists to close"
        )
    finally:
        GATE_SRC.write_text(original)
        BASELINE_FIXTURE.unlink(missing_ok=True)
    return failures


def main() -> int:
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

        print("mutations: each must flip exactly the cases that name it")
        print("-" * 78)
        for mut in MUTATIONS:
            original = mut.path.read_text()
            if original.count(mut.old) != 1:
                failures.append(
                    f"{mut.mid}: PATTERN occurs {original.count(mut.old)} times, expected 1"
                )
                print(f"  {mut.mid:<32} *** NOT A VALID MUTANT ***")
                continue
            mut.path.write_text(original.replace(mut.old, mut.new))
            try:
                got = run_leg(mut.leg, tmpdir)
            finally:
                mut.path.write_text(original)
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
                f"  {mut.mid:<32} {'flips ' + ','.join(expected) if ok else '*** WRONG CASES FLIPPED *** ' + str(flipped)}"
            )

        print("\nT4-R6: the ESLint leg's files: scope, proved in both directions")
        print("-" * 78)
        failures += scope_proof()

        print("\nR4: the baseline counts occurrences rather than storing a set")
        print("-" * 78)
        failures += baseline_proof(tmpdir)
    finally:
        C.ESLINT_FIXTURE.unlink(missing_ok=True)
        SCOPE_FIXTURE.unlink(missing_ok=True)
        BASELINE_FIXTURE.unlink(missing_ok=True)
        for leftover in tmpdir.glob("*"):
            leftover.unlink()
        tmpdir.rmdir()

    print()
    if failures:
        print("SELFTEST: FAILURES")
        for f in failures:
            print("  " + f)
        return 1
    print(
        f"SELFTEST: all {len(MUTATIONS)} mutations flipped exactly their own cases, "
        "the scope holds in both directions, the baseline counts, and both "
        "positive controls stayed silent on correct code"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
