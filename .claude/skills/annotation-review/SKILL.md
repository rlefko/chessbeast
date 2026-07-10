---
name: annotation-review
description: Review annotation output quality against the annotation conventions. Use when a change touches packages/llm/src/narration, packages/llm/src/annotation, packages/llm/src/themes, or packages/pgn/src/transformer, when prompt text changes anywhere in the repo, or when reviewing a sample annotated PGN. Trigger phrasings include "review the narrator change", "check these prompt edits", "does this comment output look right", "review annotation quality", "check the density change", or "read this annotated game". Reads docs/annotation-conventions.md as the source of truth.
---

# Annotation Review

This is a review tool, not a rubber stamp. Every rule below was earned by a real defect that reached output: UCI strings in published comments, blunders praised as good ideas, verbose games that ignored the user's density setting. Your job is to catch the next one before it ships.

## Step 1: Load the source of truth

Read `docs/annotation-conventions.md` in full, top to bottom, including the review checklist at the bottom. The doc is authoritative over this skill: if this skill and the doc disagree, follow the doc and flag the discrepancy in your report.

## Step 2: Gather the change under review

- If the user named a target (a PR, a file, a sample annotated PGN), review that.
- Otherwise run `git diff origin/main...HEAD` plus `git diff HEAD` and review the combined change.
- If the diff is empty, or nothing in it touches annotation output paths (`packages/llm/src/narration`, `packages/llm/src/annotation`, `packages/llm/src/themes`, `packages/pgn/src/transformer`, prompt text, or annotated-output fixtures), say so plainly and stop. Do not manufacture findings out of scope.

## Step 3: Walk the review checklist

Work through the review checklist at the bottom of `docs/annotation-conventions.md` in order. Run its mechanical grep commands rather than eyeballing; the commands exist because eyeballing has missed these defects before. For each hit, read the full post-change file around it, not just the diff hunk: prompt text and filter logic both change meaning through context that a hunk hides. If the change touches prompt text, generate or request a sample annotated PGN and read it end to end as a reader.

## Step 4: Report

Structure the report as:

1. **Verdict**: one of `clean`, `clean with notes`, or `violations found`.
2. **Violations**: for each, give `file:line`, the rule broken by section number (e.g., "rule 3.1"), the concrete harm to a reader of the output, and the compliant fix naming an existing primitive (e.g., "route through `sortIntentsByPriority`", "let `DensityFilter` decide", "use the `buildTemplateSummary` fallback").
3. **Risks worth a look**: things that are not violations today but sit one refactor away from one.
4. **Confirmed clean**: the checklist areas you actually exercised, so the reader knows what was covered.

Keep it tight: findings first, no praise.
