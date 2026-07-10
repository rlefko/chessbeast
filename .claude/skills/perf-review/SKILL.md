---
name: perf-review
description: Performance review for ChessBeast pipeline changes. Use when a diff touches packages/core/src/exploration, packages/core/src/storage, packages/llm/src/narration/narrator.ts, packages/llm/src/client, packages/cli/src/orchestrator, packages/debug-gui/src/server, or a pool.py under services/. Also use when the user says things like "perf review this", "did we regress throughput", "is this loop too slow", "check the engine budget", "review LLM fan-out", or "is the GUI slowing the pipeline". Reads docs/performance-conventions.md as the source of truth.
---

# Performance Review

This is a review tool, not a rubber stamp. Every rule below was earned by a real defect: PRs #96-#100 silently added hundreds of ChessPosition instantiations per game until PR #101 clawed the speed back, and PR #102 found comment generation serialized when it should have fanned out. The job is to catch the next one of those before it merges.

## Step 1: Load the source of truth

Read docs/performance-conventions.md in full, including the review checklist at the bottom. The doc is authoritative over this skill: if they disagree, the doc wins. Do not review from memory of the rules; the doc changes as new regressions earn new rules.

## Step 2: Gather the change under review

If the user named a target (a PR, a branch, specific files), review that. Otherwise review the working state:

```bash
git diff origin/main...HEAD
git diff HEAD
```

If both are empty, or the change touches nothing this doc governs (no exploration, storage, narration, client, orchestrator, GUI server, or engine pool code), say so plainly and stop. Do not manufacture findings from out-of-scope files.

## Step 3: Walk the review checklist

Work through the checklist at the bottom of docs/performance-conventions.md in order. Run its mechanical grep commands rather than eyeballing the diff; the commands exist because eyeballing missed the PR #96-#100 regression five times in a row.

For every hit, read the full post-change file around it, not just the diff hunk. A `new ChessPosition(` line is only a violation if the enclosing scope is a loop; an `await` in a loop is only a violation if the iterations are independent; a depth literal is fine in a test fixture. Context decides, and context lives outside the hunk.

Also apply rule 4 judgment: if the diff plausibly affects throughput and the PR description cites no before/after `make test-benchmark` run, that is a finding, not a nitpick.

## Step 4: Report

Structure the report exactly as follows, findings first, no praise.

**Verdict**: one of `clean`, `clean with notes`, or `violations found`.

**Violations**: for each, give:

- `file:line`
- The rule broken, by section number in docs/performance-conventions.md (e.g. "violates 1.1")
- The concrete harm (what gets slower, by roughly how much, or what budget it silently spends)
- The compliant fix, naming an existing primitive: `moveWithUci()`, `ChessPosition.convertPvToSan`, `pLimit`, `getUltraFastTierConfig`, `EXPLORATION_BUDGET_MS_*`, `ArtifactCache.getCachedEval`-style cache reads, the pool's `acquire`/`release`, or the emitter's enabled check.

**Risks worth a look**: things that are not clear violations but smell like the start of one (a loop that is fine today but sits on a growth path, an unmetered call site behind a flag).

**Confirmed clean**: list only the checklist areas you actually exercised (commands run, files read), so the reader knows what was covered versus skipped.

Keep it tight. A three-line report on a clean diff beats a page of hedging.
