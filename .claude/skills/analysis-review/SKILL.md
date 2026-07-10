---
name: analysis-review
description: Chess-correctness review for ChessBeast analysis changes. Use when a diff touches packages/core/src/classifier, packages/core/src/exploration, packages/core/src/storage, packages/pgn/src, packages/llm/src/explorer, packages/cli/src/orchestrator, or services/. Also use when the user says things like "chess correctness", "check the notation change", "review the classifier change", or "are these plies right". Reads docs/analysis-conventions.md as the source of truth.
---

# Chess-Correctness Review

This is a review tool, not a rubber stamp. Every rule below was earned by a real defect: double UCI-to-SAN conversion broke candidate building (PR #91), comments landed one move early until the after-move ply convention was unified (PR #95), and isolated engine failures were swallowed instead of surfaced (PR #94). The job is to catch the next one of those before it merges.

## Step 1: Load the source of truth

Read docs/analysis-conventions.md in full, including the review checklist at the bottom. The doc is authoritative over this skill: if they disagree, the doc wins. Do not review from memory of the rules; the doc changes as new defects earn new rules.

## Step 2: Gather the change under review

If the user named a target (a PR, a branch, specific files), review that. Otherwise review the working state:

```bash
git diff origin/main...HEAD
git diff HEAD
```

If both are empty, or the change touches nothing this doc governs (no notation, ply, classifier, perspective, eval, DAG, or engine-failure code), say so plainly and stop. Do not manufacture findings from out-of-scope files.

## Step 3: Walk the review checklist

Work through the checklist at the bottom of docs/analysis-conventions.md in order. Run its mechanical grep commands rather than eyeballing the diff; the commands exist because eyeballing missed the UCI-leak and ply-placement regressions more than once.

For every hit, read the full post-change file around it, not just the diff hunk. A `sanToUci(` call is only a violation if it is a second notation boundary outside the adapter; a `plyIndex - 1` is only a violation if no nearby comment states the after-move basis; a centipawn literal is fine in a test fixture. Context decides, and context lives outside the hunk. When a change touches placement, NAG assignment, or criticality, read the enclosing function end to end.

## Step 4: Report

Structure the report exactly as follows, findings first, no praise.

**Verdict**: one of `clean`, `clean with notes`, or `violations found`.

**Violations**: for each, give:

- `file:line`
- The rule broken, by section number in docs/analysis-conventions.md (e.g. "violates 1.1")
- The concrete harm (a raw UCI string in output, a comment on the wrong ply, a flipped eval sign, a swallowed engine failure)
- The compliant fix, naming an existing primitive: `ChessPosition.convertPvToSan` at the adapter, `moveWithUci()`, the `isUciMove` guard, the after-move `plyIndex` convention, `RATING_THRESHOLDS` in `thresholds.ts`, the `evalToPositionNag`/`evalToVerbalDescription` conventions, or the `onWarning` path into the runner's warnings.

**Risks worth a look**: things that are not clear violations but smell like the start of one (an eval consumer that reads a sign without naming its perspective, a catch that surfaces nothing today but sits on a path that will fail).

**Confirmed clean**: list only the checklist areas you actually exercised (commands run, files read), so the reader knows what was covered versus skipped.

Keep it tight. A three-line report on a clean diff beats a page of hedging.
