#!/usr/bin/env python3
"""Mutation-test the unit-audit manifest checker against what it claims to cover.

★ WHY THIS FILE EXISTS. `units.manifest.json` is an artifact that asserts
something about every module in a stated universe, and this workstream's
standing rule is that any artifact asserting completeness must ITSELF be
mutation-tested against what it claims. A manifest whose checker cannot fail is
a name list wearing a guarantee's name, and this phase has now shipped that
exact shape once at each of three different levels.

★ THE THIRD DIRECTION IS THE POINT. Plan ruling R9 came out of a review that
killed the previous design: a manifest proving parity between module NAMES and
rows cannot see unit behaviour ADDED to a module already dispositioned
`no unit behaviour`. Drop `` `${draft.liters} L` `` into such a file and the
name set does not change, so nothing fires. Binding each disposition to a
content digest closes that, and R9 asks for the proof to be specific:

    editing a `no unit behaviour` module must fail SPECIFICALLY on the digest
    mismatch, not incidentally.

So the checker tags every failure and this file asserts on the exact TAG SET,
not on the exit code. "Something was wrong" is not the same claim as "the digest
caught it", and an exit code cannot tell them apart. That distinction is the
whole reason `checkManifest` collects every failure instead of returning the
first one.

★ AND THE CHECKER IS MUTATED TOO, not only the tree and the manifest. A
tree-and-manifest mutation proves the CURRENT checker fires; it says nothing
about whether the digest comparison is what fired. M-D and M-E delete the two
rules and show the corresponding mutations go quiet, which is what makes the
first three mean anything.

★ NO SHARED LOCK, DELIBERATELY. `units_gate_corpus.py` and
`units_gate_selftest.py` share a fixture path under `scripts/` and take an
O_EXCL lock against each other, because a concurrent run could otherwise report
a result reflecting a file it did not write. This file needs no lock: its whole
universe is a throwaway tree in a tempdir, addressed through the checker's
`--root` and `--manifest` flags. The only thing it writes under `scripts/` is a
`.mutant.generated.` checker copy, which nothing else touches and `eslint`
ignores. Keep it that way.

Usage::

    python3 frontend/scripts/units_manifest_selftest.py

Exit code: 1 if any mutation fails to produce exactly the failure it names.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]
CHECKER = "scripts/validate-units-manifest.ts"
CHECKER_SRC = FRONTEND / CHECKER
# `.mutant.generated.` is the infix eslint.config.js ignores, so even a copy
# leaked by a killed run is inert rather than a lint failure.
CHECKER_MUTANT = FRONTEND / "scripts/units-manifest.mutant.generated.ts"

# re.M is load bearing: without it `^` anchors to the start of the whole
# capture and every failure line reads as no failure at all, which made the
# first run of this file report "tags=[]" for nine checks that had in fact
# fired. A parser that cannot see the gate firing is this phase's signature
# defect one more level up.
FAILURE_LINE = re.compile(r"^\s+\[(\w+)\]\s+(\S+)", re.M)

# Everything after this line is the advice paragraph, not findings.
LEGEND_SENTINEL = "The manifest is a REVIEWED SNAPSHOT"


def build_tree(root: Path) -> None:
    """A miniature frontend: an entry document, two modules, and the public tree."""
    (root / "src").mkdir(parents=True)
    (root / "public" / "locales" / "xx").mkdir(parents=True)
    (root / "index.html").write_text("<!doctype html><title>t</title>\n")
    (root / "public" / "offline.html").write_text("<p>offline</p>\n")
    (root / "public" / "icon.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    (root / "src" / "main.tsx").write_text(
        "import './alpha'\nimport './beta'\nimport './delta'\n"
    )
    (root / "src" / "alpha.ts").write_text("export const A = 1\n")
    # The baselined module. `units.baseline.json` records the same work from a
    # different program, which is what makes an erased finding detectable.
    (root / "src" / "delta.ts").write_text("export const D = 4\n")
    (root / "scripts").mkdir()
    (root / "scripts" / "units.baseline.json").write_text(
        json.dumps(
            [
                {
                    "file": "src/delta.ts",
                    "kind": "compare",
                    "text": "x === 'imperial'",
                    "count": 2,
                }
            ],
            indent=1,
        )
        + "\n"
    )
    # Named by the audited row below. Not imported from main.tsx, so it is not
    # in the universe and needs no row of its own.
    (root / "src" / "__tests__").mkdir()
    (root / "src" / "__tests__" / "alpha.test.ts").write_text("export const T = 1\n")
    (root / "src" / "beta.ts").write_text("export const B = 2\n")
    (root / "public" / "sw.js").write_text(
        "self.addEventListener('install', () => {})\n"
    )
    (root / "public" / "locales" / "xx" / "common.json").write_text('{"a": "b"}\n')


def run(
    root: Path,
    manifest: Path,
    checker: str = CHECKER,
    against: Path | None = None,
) -> tuple[int, set[str], list[tuple[str, str]], str]:
    """Run the checker and return (rc, tag set, (tag, path) pairs, output).

    With no `against`, the checker falls back to `--against-ref HEAD`, finds no
    git repository under a tempdir, and says so. That is what every probe which
    is not about drift wants; the git default is exercised for real further
    down, against a throwaway repository of this file's own making.
    """
    argv = ["bun", "run", checker, "--root", str(root), "--manifest", str(manifest)]
    argv += ["--baseline", str(root / "scripts" / "units.baseline.json")]
    if against is not None:
        argv += ["--against-file", str(against)]
    p = subprocess.run(argv, cwd=FRONTEND, capture_output=True, text=True)
    out = p.stdout + p.stderr
    # ★ Parse only the failure block. The advice paragraph below it explains
    # each tag in the SAME `  [tag]  text` shape, so a whole-output scan reports
    # every tag on every run and no assertion here can ever fail. That is the
    # third time in this workstream a checker's own reader has been the thing
    # that could not see a failure; hence the sentinel rather than a cleverer
    # regex.
    pairs = [
        (m.group(1), m.group(2))
        for m in FAILURE_LINE.finditer(out.split(LEGEND_SENTINEL)[0])
    ]
    return p.returncode, {t for t, _ in pairs}, pairs, out


def seed(root: Path, manifest: Path) -> None:
    """Seed the fixture manifest and give every row a disposition."""
    subprocess.run(
        [
            "bun",
            "run",
            CHECKER,
            "--update",
            "--root",
            str(root),
            "--manifest",
            str(manifest),
        ],
        cwd=FRONTEND,
        capture_output=True,
        text=True,
        check=True,
    )
    rows = json.loads(manifest.read_text())
    for row in rows:
        if row["path"] == "src/delta.ts":
            row["disposition"] = "audited"
            row["findings"] = ["compare x2 (units gate baseline)"]
            row["owners"] = ["task 6"]
        elif row["path"] == "src/alpha.ts":
            # One audited row carrying both kinds of evidence, so every schema
            # rule below has something to bite.
            row["disposition"] = "audited"
            row["tests"] = ["__tests__/alpha.test.ts"]
            row["findings"] = ["a recorded finding"]
            row["owners"] = ["task 6"]
        else:
            row["disposition"] = "no unit behaviour"
    manifest.write_text(json.dumps(rows, indent=1) + "\n")


def write_checker_mutant(old: str, new: str) -> tuple[str, int]:
    """Write a mutated COPY of the checker. Never the original."""
    text = CHECKER_SRC.read_text()
    n = text.count(old)
    if n == 1:
        CHECKER_MUTANT.write_text(text.replace(old, new))
    return str(CHECKER_MUTANT.relative_to(FRONTEND)), n


# id -> (find, replace), applied to a COPY of the checker. Never the original.
CHECKER_MUTATIONS = {
    "M-D-drop-digest-comparison": (
        "    if (row.digest !== actual) {",
        "    if (false) {",
    ),
    "M-E-drop-parity": (
        "  const universe = new Set(universeOf(root))",
        "  const universe = new Set(universeOf(root))\n  if (universe.size >= 0) return failures",
    ),
}


def git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-c", "user.email=selftest@example.invalid", "-c", "user.name=selftest", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    )


def git_probe(tmp: Path) -> list[str]:
    """The production path: previous manifest read from a git ref."""
    failures: list[str] = []
    repo = tmp / "gitrepo"
    build_tree(repo)
    manifest = repo / "scripts" / "units.manifest.json"
    seed(repo, manifest)
    pristine = manifest.read_text()
    try:
        git(repo, "init", "-q")
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", "seed")
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        failures.append(f"git probe: could not build a repository: {exc}")
        print("  git repository                         *** COULD NOT BUILD ***")
        return failures

    rc, tags, _pairs, out = run(repo, manifest)
    # The success line must NAME the ref, or the reader returned null and every
    # drift probe above proved nothing about production.
    compared = "no conclusion weakened against HEAD:" in out
    ok = rc == 0 and not tags and compared
    print(
        f"  {'git HEAD baseline':<38} "
        + ("clean, and it says what it compared" if ok else "*** " + out.strip()[:90] + " ***")
    )
    if not ok:
        failures.append(f"git probe baseline: rc={rc} tags={sorted(tags)} compared={compared}")

    weakened = json.loads(pristine)
    for r in weakened:
        if r["path"] == "src/alpha.ts":
            r["disposition"] = "no unit behaviour"
            r.pop("tests", None)
            r.pop("findings", None)
            r.pop("owners", None)
    manifest.write_text(json.dumps(weakened, indent=1) + "\n")
    rc, tags, pairs, out = run(repo, manifest)
    ok = rc == 1 and tags == {"weakened"} and "src/alpha.ts" in [p for _, p in pairs]
    print(
        f"  {'git HEAD weakening':<38} "
        + ("fails on ['weakened']" if ok else "*** rc=" + str(rc) + " " + str(sorted(tags)) + " ***")
    )
    if not ok:
        failures.append(f"git probe weakening: rc={rc} tags={sorted(tags)}")
    return failures


def main() -> int:
    failures: list[str] = []
    tmp = Path(tempfile.mkdtemp(prefix="units-manifest-selftest-"))
    root = tmp / "tree"
    manifest = tmp / "units.manifest.json"
    try:
        build_tree(root)
        seed(root, manifest)
        # Every probe below mutates the manifest and restores from this, so it
        # is the fixture's single source of truth rather than a saved copy of
        # seed()'s return value.
        pristine = manifest.read_text()

        def check(
            label: str,
            expect_rc: int,
            expect_tags: set[str],
            expect_path: str | None,
            checker: str = CHECKER,
            against: Path | None = None,
        ) -> None:
            rc, tags, pairs, out = run(root, manifest, checker, against)
            bad = []
            if rc != expect_rc:
                bad.append(f"rc={rc}, expected {expect_rc}")
            if tags != expect_tags:
                bad.append(f"tags={sorted(tags)}, expected {sorted(expect_tags)}")
            if expect_path is not None and expect_path not in [p for _, p in pairs]:
                bad.append(f"no failure named {expect_path}: {pairs}")
            mark = (
                "*** FAILED ***"
                if bad
                else ("clean" if expect_rc == 0 else f"fails on {sorted(tags)}")
            )
            print(f"  {label:<38} {mark}")
            if bad:
                failures.append(f"{label}: {'; '.join(bad)}")
                print(f"      {out.strip()[:600]}")

        print("baseline: a seeded, fully dispositioned manifest must pass")
        print("-" * 78)
        check("baseline", 0, set(), None)

        print("\nthe three directions R9 requires, each shown firing")
        print("-" * 78)

        # 1. A module enters the universe. The tree changes, the manifest does not.
        (root / "src" / "gamma.ts").write_text("export const G = 3\n")
        (root / "src" / "main.tsx").write_text(
            "import './alpha'\nimport './beta'\nimport './delta'\nimport './gamma'\n"
        )
        check(
            "M-A-new-module-undispositioned", 1, {"unlisted", "digest"}, "src/gamma.ts"
        )
        # main.tsx's own digest moved too, which is the mechanism working: the
        # file that gained an import is itself a file that changed.
        (root / "src" / "main.tsx").write_text(
            "import './alpha'\nimport './beta'\nimport './delta'\n"
        )
        (root / "src" / "gamma.ts").unlink()
        check("M-A-reverted", 0, set(), None)

        # 2. A row is deleted from the manifest. The tree is untouched.
        manifest.write_text(
            json.dumps(
                [r for r in json.loads(pristine) if r["path"] != "src/beta.ts"],
                indent=1,
            )
            + "\n"
        )
        check("M-B-row-removed", 1, {"unlisted"}, "src/beta.ts")
        manifest.write_text(pristine)

        # 3. ★ The one round 5 exists for: a `no unit behaviour` module gains
        #    unit behaviour. Nothing about the NAME set changes, so only the
        #    digest can see it, and the assertion below is on the tag rather
        #    than the exit code precisely so "something failed" cannot pass.
        beta = root / "src" / "beta.ts"
        original_beta = beta.read_text()
        beta.write_text("export const B = 2\nexport const label = `${B} L`\n")
        check("M-C-dispositioned-module-edited", 1, {"digest"}, "src/beta.ts")

        print("\nand the checker itself, so the three above mean something")
        print("-" * 78)
        for mid, (old, new) in CHECKER_MUTATIONS.items():
            mutant, n = write_checker_mutant(old, new)
            if n != 1:
                failures.append(f"{mid}: PATTERN occurs {n} times, expected 1")
                print(
                    f"  {mid:<38} *** NOT A VALID MUTANT *** pattern occurs {n} times"
                )
                continue
            try:
                if mid == "M-D-drop-digest-comparison":
                    # beta.ts is still edited: with the digest rule gone, the
                    # mutation above goes silent.
                    check(f"{mid} -> M-C goes quiet", 0, set(), None, mutant)
                else:
                    beta.write_text(original_beta)
                    manifest.write_text(
                        json.dumps(
                            [
                                r
                                for r in json.loads(pristine)
                                if r["path"] != "src/beta.ts"
                            ],
                            indent=1,
                        )
                        + "\n"
                    )
                    check(f"{mid} -> M-B goes quiet", 0, set(), None, mutant)
                    manifest.write_text(pristine)
            finally:
                CHECKER_MUTANT.unlink(missing_ok=True)
        beta.write_text(original_beta)
        manifest.write_text(pristine)

        print("\nthe remaining rules, each pinned from the side that can fail")
        print("-" * 78)

        # A row that outlived its file.
        extra = json.loads(pristine) + [
            {
                "path": "src/deleted.ts",
                "disposition": "no unit behaviour",
                "digest": "0" * 64,
            }
        ]
        manifest.write_text(json.dumps(extra, indent=1) + "\n")
        check("orphan-row", 1, {"orphan"}, "src/deleted.ts")

        # Two rows for one path: one disposition hides the other.
        dup = json.loads(pristine)
        dup.append(dict(dup[0]))
        manifest.write_text(json.dumps(dup, indent=1) + "\n")
        check("duplicate-row", 1, {"duplicate"}, dup[0]["path"])

        # An audited row backed by nothing. BOTH kinds of evidence have to go:
        # dropping only `tests` leaves `findings` standing, and the first version
        # of this probe did exactly that and reported clean.
        bare = json.loads(pristine)
        for r in bare:
            if r["path"] == "src/alpha.ts":
                r.pop("tests", None)
                r.pop("findings", None)
                r.pop("owners", None)
        manifest.write_text(json.dumps(bare, indent=1) + "\n")
        check("audited-without-evidence", 1, {"schema"}, "src/alpha.ts")

        # An unverifiable row that does not say what would settle it.
        vague = json.loads(pristine)
        for r in vague:
            if r["path"] == "src/alpha.ts":
                r.pop("tests", None)
                r["disposition"] = "unverifiable"
        manifest.write_text(json.dumps(vague, indent=1) + "\n")
        check("unverifiable-without-reason", 1, {"schema"}, "src/alpha.ts")

        # A `no unit behaviour` row that records a unit finding anyway.
        contradictory = json.loads(pristine)
        for r in contradictory:
            if r["path"] == "src/beta.ts":
                r["findings"] = ["renders canonical litres"]
        manifest.write_text(json.dumps(contradictory, indent=1) + "\n")
        check("no-unit-behaviour-with-finding", 1, {"schema"}, "src/beta.ts")

        # A test id that names no file: the quiet one.
        phantom = json.loads(pristine)
        for r in phantom:
            if r["path"] == "src/alpha.ts":
                r["tests"] = ["__tests__/renamed.test.ts"]
        manifest.write_text(json.dumps(phantom, indent=1) + "\n")
        check("test-id-names-nothing", 1, {"schema"}, "src/alpha.ts")

        # An owner spelled a way nothing greps for.
        misowned = json.loads(pristine)
        for r in misowned:
            if r["path"] == "src/alpha.ts":
                r["owners"] = ["Task 6 (units)"]
        manifest.write_text(json.dumps(misowned, indent=1) + "\n")
        check("owner-not-in-the-enum", 1, {"schema"}, "src/alpha.ts")

        # A finding nobody holds.
        unowned = json.loads(pristine)
        for r in unowned:
            if r["path"] == "src/alpha.ts":
                r.pop("owners", None)
        manifest.write_text(json.dumps(unowned, indent=1) + "\n")
        check("finding-without-an-owner", 1, {"schema"}, "src/alpha.ts")

        # An owner holding nothing.
        idle = json.loads(pristine)
        for r in idle:
            if r["path"] == "src/beta.ts":
                r["owners"] = ["task 6"]
        manifest.write_text(json.dumps(idle, indent=1) + "\n")
        check("owner-without-a-finding", 1, {"schema"}, "src/beta.ts")

        # ---- THE FOURTH DIRECTION -------------------------------------
        # ★ The digest pins CONTENT. Until this section existed, nothing pinned
        # the CONCLUSION: a reviewer downgraded all 83 non-trivial rows and
        # deleted every finding, touched not one source file, and the gate
        # printed the permitted sentence and exited 0. The findings ARE the work
        # list tasks 2 through 7 consume, so the cheapest path to a green row was
        # to erase the finding rather than repair the file.
        print("\n★ the fourth direction: a conclusion may only weaken with the file")
        print("-" * 78)

        prev = tmp / "previous.manifest.json"
        prev.write_text(pristine)

        # M-H: the disposition gets cheaper, the file does not move.
        downgraded = json.loads(pristine)
        for r in downgraded:
            if r["path"] == "src/alpha.ts":
                r["disposition"] = "no unit behaviour"
                r.pop("tests", None)
                r.pop("findings", None)
                r.pop("owners", None)
        manifest.write_text(json.dumps(downgraded, indent=1) + "\n")
        check("M-H-disposition-downgraded", 1, {"weakened"}, "src/alpha.ts", against=prev)

        # M-I: one finding quietly disappears.
        erased = json.loads(pristine)
        for r in erased:
            if r["path"] == "src/alpha.ts":
                r["findings"] = []
                r.pop("owners", None)
        manifest.write_text(json.dumps(erased, indent=1) + "\n")
        check("M-I-finding-erased", 1, {"weakened"}, "src/alpha.ts", against=prev)

        # ★ M-J: the SAME erasure, with the file actually repaired. This is the
        # legitimate direction and it must stay silent, or the rule blocks the
        # work it exists to protect.
        alpha = root / "src" / "alpha.ts"
        original_alpha = alpha.read_text()
        alpha.write_text("export const A = 1\nexport const repaired = true\n")
        repaired = json.loads(pristine)
        for r in repaired:
            if r["path"] == "src/alpha.ts":
                r["findings"] = []
                r.pop("owners", None)
                r["digest"] = hashlib.sha256(alpha.read_bytes()).hexdigest()
        manifest.write_text(json.dumps(repaired, indent=1) + "\n")
        check("M-J-erased-WITH-a-repair", 0, set(), None, against=prev)
        alpha.write_text(original_alpha)

        # M-K: strengthening is always allowed.
        stronger = json.loads(pristine)
        for r in stronger:
            if r["path"] == "src/alpha.ts":
                r["findings"] = [*r["findings"], "a second recorded finding"]
        manifest.write_text(json.dumps(stronger, indent=1) + "\n")
        check("M-K-finding-added", 0, set(), None, against=prev)

        # M-L mutates the CHECKER: without the rule, M-H goes quiet.
        mutant, n = write_checker_mutant(
            "    const rankBefore = DISPOSITION_RANK[was.disposition] ?? 0",
            "    if (was) return failures",
        )
        if n != 1:
            failures.append(f"M-L-drop-the-drift-rule: PATTERN occurs {n} times")
            print(f"  {'M-L-drop-the-drift-rule':<38} *** NOT A VALID MUTANT ***")
        else:
            manifest.write_text(json.dumps(downgraded, indent=1) + "\n")
            check("M-L-drop-drift-rule -> M-H quiet", 0, set(), None, mutant, prev)
            CHECKER_MUTANT.unlink(missing_ok=True)
        manifest.write_text(pristine)

        print("\nthe second, independent record of the same work")
        print("-" * 78)

        # M-N: the row misreports what the gate baseline holds.
        miscounted = json.loads(pristine)
        for r in miscounted:
            if r["path"] == "src/delta.ts":
                r["findings"] = ["compare x1 (units gate baseline)"]
        manifest.write_text(json.dumps(miscounted, indent=1) + "\n")
        check("M-N-baseline-count-misreported", 1, {"baseline"}, "src/delta.ts")

        # ...and the erasure the cross-check exists for: no drift comparison
        # available at all, and it still fails.
        dropped = json.loads(pristine)
        for r in dropped:
            if r["path"] == "src/delta.ts":
                r["disposition"] = "no unit behaviour"
                r.pop("findings", None)
                r.pop("owners", None)
        manifest.write_text(json.dumps(dropped, indent=1) + "\n")
        check("M-N2-baselined-row-downgraded", 1, {"baseline"}, "src/delta.ts")

        # A finding claiming baseline work the baseline does not have.
        invented_work = json.loads(pristine)
        for r in invented_work:
            if r["path"] == "src/alpha.ts":
                r["findings"] = ["token-branch x9 (units gate baseline)"]
        manifest.write_text(json.dumps(invented_work, indent=1) + "\n")
        check("M-N3-baseline-work-invented", 1, {"baseline"}, "src/alpha.ts")

        # M-O mutates the CHECKER: without the rule, M-N goes quiet.
        # ★ Both DIRECTIONS at once. Emptying `work` alone silences the
        # forward check and leaves the reverse one ("records work the baseline
        # does not have") firing, which is the rule being defended twice: a
        # mutation that removes one defence flips nothing and reads as a
        # survivor. The early return drops the whole cross-check.
        mutant, n = write_checker_mutant(
            "  const work = baselineWork(baselinePath)",
            "  if (baselinePath) return failures\n  const work = baselineWork(baselinePath)",
        )
        if n != 1:
            failures.append(f"M-O-drop-the-baseline-rule: PATTERN occurs {n} times")
            print(f"  {'M-O-drop-the-baseline-rule':<38} *** NOT A VALID MUTANT ***")
        else:
            manifest.write_text(json.dumps(miscounted, indent=1) + "\n")
            check("M-O-drop-baseline-rule -> M-N quiet", 0, set(), None, mutant)
            CHECKER_MUTANT.unlink(missing_ok=True)
        manifest.write_text(pristine)

        # A disposition nobody defined.
        invented = json.loads(pristine)
        for r in invented:
            if r["path"] == "src/beta.ts":
                r["disposition"] = "probably fine"
        manifest.write_text(json.dumps(invented, indent=1) + "\n")
        check("invented-disposition", 1, {"schema"}, "src/beta.ts")

        manifest.write_text(pristine)
        check("restored", 0, set(), None)

        # The named runtime roots the import walker cannot reach. Without these
        # the universe would be "whatever the walker found", which is the exact
        # description round 5 proved false.
        # ★ The GIT default, exercised for real. Everything above drives the
        # drift rule through `--against-file`, which tests the RULE and not the
        # plumbing that finds the previous manifest in production. A reader of
        # `--against-ref HEAD` that silently returned null would pass every probe
        # above while checking nothing, which is this phase's signature defect
        # wearing yet another costume. So: a throwaway repository, a real commit,
        # and an assertion that the success line NAMES what it compared against.
        print("\nthe git default (--against-ref HEAD), against a real repository")
        print("-" * 78)
        failures += git_probe(tmp)

        print("\nthe named runtime roots, which the import walker cannot reach")
        print("-" * 78)
        for label, path in (
            ("entry document", root / "index.html"),
            ("service worker", root / "public" / "sw.js"),
            ("locale bundle", root / "public" / "locales" / "xx" / "common.json"),
            ("offline page", root / "public" / "offline.html"),
            # ★ A binary asset, on purpose. The universe rule has no extension
            # filter, and this probe is what stops a future "just skip images"
            # from putting a judgement back in the middle of the universe.
            ("binary asset", root / "public" / "icon.png"),
        ):
            rows_now = json.loads(pristine)
            target = str(path.relative_to(root))
            present = any(r["path"] == target for r in rows_now)
            manifest.write_text(
                json.dumps([r for r in rows_now if r["path"] != target], indent=1)
                + "\n"
            )
            rc, tags, pairs, out = run(root, manifest)
            ok = (
                present
                and rc == 1
                and tags == {"unlisted"}
                and target in [p for _, p in pairs]
            )
            print(
                f"  {label:<38} {'in the universe and required' if ok else '*** NOT ENFORCED ***'}"
            )
            if not ok:
                failures.append(
                    f"{label}: present={present} rc={rc} tags={sorted(tags)}"
                )
            manifest.write_text(pristine)
    finally:
        CHECKER_MUTANT.unlink(missing_ok=True)
        shutil.rmtree(tmp, ignore_errors=True)

    print()
    if failures:
        print("MANIFEST SELFTEST: FAILURES")
        for f in failures:
            print("  " + f)
        return 1
    print(
        "MANIFEST SELFTEST: all FOUR directions fired. The three R9 asks (a new module, "
        "a removed row, an edited dispositioned module) plus the fourth the review "
        "added: a conclusion may only weaken alongside a content change. The digest one "
        "fires on its own tag; deleting the digest rule, parity, the drift rule or the "
        "baseline cross-check each silences exactly its own direction; repairing the "
        "file makes the same erasure legitimate; the git default was driven against a "
        "real repository and says what it compared; and every named runtime root is "
        "enforced, the entry document and a binary asset among them."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
