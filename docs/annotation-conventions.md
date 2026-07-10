# Annotation Conventions

**Prime directive:** Every comment must read like a strong human coach: it shows the idea instead of telling the eval, it lands on the move the reader is looking at, it fits its budget, and it never speaks engine.

This doc owns how the output reads: voice, budgets, density, and honesty. Chess correctness (notation, plies, perspective signs, eval semantics, failure handling) lives in [analysis-conventions.md](analysis-conventions.md). Speed and cost (hot loops, LLM fan-out, engine budget) live in [performance-conventions.md](performance-conventions.md). Do not restate their rules here; reference them by section.

Every rule below was earned by a real defect that shipped. The "Earned by" line tells you which one. The "Pinned by" line tells you which test will catch a regression, so if you change the behavior, change the pin in the same PR.

## 1. Coach voice

### 1.1 Show the idea, don't tell the eval

**Comments explain plans and consequences, not numbers.** A reader learns from "the knight is heading to d5 and nothing can evict it," not from "+1.3." The narrator's system prompt encodes this: eval numbers are omitted by default (`showEvaluations: false`) and the prompt says to focus on concepts. Eval context still goes INTO the prompt so the model knows what happened; it just must not come OUT as the point of the comment.

- Earned by: PRs #48 and #52, which introduced and then applied the show-don't-tell style after early output read like an engine log.
- Pinned by: `buildSystemPrompt` in `packages/llm/src/narration/narrator.ts` is the single source; `defaults to a neutral, third-person system prompt` in `packages/llm/src/__tests__/narrator.test.ts` captures the prompt shape.

### 1.2 Blunders and mistakes are explained as failures, never framed positively

**A `blunder_explanation` comment must say what is wrong with the move.** The user prompt for blunder intents explicitly instructs "NEVER describe the played move positively," and `getIntentTypeDescription` in `packages/llm/src/narration/intents.ts` describes the task as explaining why the move is bad. If you touch these prompts, the failure mode you are guarding against is a comment that praises a losing move.

- Earned by: PRs #96 and #97, where blunder comments described bad moves as if they were good ideas.
- Pinned by: `names the better alternative in blunder fallbacks` in `packages/llm/src/__tests__/narrator.test.ts` and the `determineIntentType` blunder tests in `packages/llm/src/__tests__/intents.test.ts`. The blunder guidance inside `buildPrompt` itself has no direct pin, so any change there requires the sample read in checklist item 5.

### 1.3 Audience reframes wording, never adds content

**`AudienceLevel` (`beginner | club | expert`) changes vocabulary and framing only.** The same move gets the same idea explained; a beginner just gets it without eval numbers and with plainer words. Audience must never gate which moments get comments (that is density and priority, section 4) or invent extra material.

- Earned by: the same #96/#97 quality rounds; audience-conditional content was one source of inconsistent output.
- Pinned by: `audienceDescriptions` in `buildSystemPrompt` (`packages/llm/src/narration/narrator.ts`) and `audienceToLineMemoryConfig` in `packages/cli/src/orchestrator/ultra-fast-coach.ts`.

### 1.4 Perspective controls we/they language only

**`AnnotationPerspective` (`neutral | white | black`) changes pronouns, never evaluations.** "We dropped a pawn" and "White dropped a pawn" are both honest; "we're doing fine" when the eval collapsed is not. The perspective guidelines in the system prompt end with "Keep evaluations objective" for a reason. Sign conventions for evals themselves belong to analysis-conventions.

- Earned by: the 2026 cleanup, which wired `--perspective` end to end (CLI flag in `packages/cli/src/cli.ts`, schema in `packages/cli/src/config/schema.ts`, runner pass-through in `packages/cli/src/orchestrator/ultra-fast-coach-runner.ts`) after it had been silently ignored.
- Pinned by: perspective prompt tests in `packages/llm/src/__tests__/narrator.test.ts`.

## 2. Budgets

### 2.1 The word limit is derived in one place

**`maxWordsPerComment` comes from `MAX_WORDS_PER_COMMENT` in `packages/cli/src/orchestrator/ultra-fast-coach.ts`.** The narrator's system prompt interpolates `this.config.maxWordsPerComment`, so the prompted limit tracks the configured limit automatically. The drift risk is second literals: `buildPrompt` in `narrator.ts` carries per-intent target lengths (`brief` 10-20, `standard` 20-35, `detailed` 35-50 words) that must stay inside the configured maximum, and the defaults in `DEFAULT_NARRATOR_CONFIG` (`narrator.ts`) and `DEFAULT_CONFIG` (`packages/llm/src/annotation/post-write-pipeline.ts`) must match the derived constant. Never add a new hard-coded word count near a prompt.

- Earned by: PR #77, where inconsistent limits produced verbose comments the config said were impossible.
- Pinned by: the word-limit and prompt-content tests in `packages/llm/src/__tests__/narrator.test.ts`.

### 2.2 Honesty note: the word limit is prompt-level guidance only

**Today, nothing truncates an over-long LLM response.** `cleanComment` normalizes whitespace and punctuation but never cuts words; a 120-word response survives a 50-word limit intact. This is pinned as current behavior (the test itself calls it "arguably a bug"). The rule is not "pretend it's enforced." The rule is: any future enforcement change updates the prompt, the code, and the pin together, in one PR.

- Pinned by: `passes over-long LLM output through unmodified` in `packages/llm/src/__tests__/narrator.test.ts`.

## 3. No engine-speak in output

### 3.1 Comments and variations contain SAN only; raw UCI in output is a release blocker

**A reader must never see `f5g7` where `Nxg7` belongs.** SAN conversion happens once at the notation boundary (see analysis-conventions for where). The DAG transformer keeps a last-line guard: `isUciMove` on `edge.san` in `packages/pgn/src/transformer/dag-transformer.ts` converts a leaked UCI string and logs loudly, because a leak reaching that guard means an upstream bug. Treat any UCI string in rendered PGN, comments, or variation text as a release blocker, and treat a new `console.warn` from the guard as a bug report.

- Earned by: PRs #96 through #100, an entire fix arc of UCI leaking into comments, candidates, and rendered variations.
- Pinned by: the `UCI-leak defense in edge.san` suite in `packages/pgn/src/__tests__/dag-transformer.test.ts` (which intentionally contains UCI-shaped fixtures; do not "fix" those).

### 3.2 FEN is LLM context, never output

**FEN goes into prompts so the model can see the board; it must never appear in a comment.** `intent.content.fen` feeds `buildPrompt` in `narrator.ts`. If a FEN string shows up in generated text, the cleanup path or the prompt is broken.

- Earned by: PR #99, which added FEN propagation to intents precisely so comments could be board-accurate without quoting engine state.
- Pinned by: `carries fen and plyIndex through to the created intent` in `packages/llm/src/__tests__/intents.test.ts`.

## 4. Density and redundancy are user contracts

### 4.1 `--comment-density` budgets are fixed contracts

**`sparse`, `normal`, and `verbose` map to `DENSITY_CONFIGS` in `packages/llm/src/narration/density.ts` (1, 2, and 3 comments per window, plus ratio and gap rules).** A user who asked for sparse gets sparse. Do not tune these numbers to make one game look better.

- Earned by: PR #77 (verbose-comment complaints) and PR #53 before it.
- Pinned by: `packages/llm/src/__tests__/density.test.ts`.

### 4.2 One comment per ply; the highest-priority intent wins

**Comments are keyed by ply, so only one can survive per ply.** The narrator dedupes same-ply intents after a stable ply sort, keeping the first (highest-priority, mandatory-first) intent instead of letting a later narration overwrite it. This exists because the after-move-ply unification put multiple intents on the same ply for the first time.

- Earned by: the 2026 cleanup, immediately after the after-move-ply unification.
- Pinned by: same-ply dedupe tests in `packages/llm/src/__tests__/narrator.test.ts`.

### 4.3 Intents pass through priority sort before density

**`PostWritePipeline.annotate` calls `sortIntentsByPriority` before `densityFilter.filter`.** The density filter resolves adjacent-ply conflicts in input order, so the sort is what makes the outcome order-independent: a blunder beats a theme note regardless of which was generated first.

- Earned by: the 2026 cleanup regression pins, which caught order-dependent filtering.
- Pinned by: `resolves density conflicts between adjacent optional intents by priority, not input order` in `packages/llm/src/__tests__/post-write-pipeline.test.ts`.

### 4.4 Mandatory intents always survive the cap

**Blunders and large swings set `mandatory: true` (see `isMandatoryIntent` in `packages/llm/src/narration/intents.ts`) and survive every filter.** The density filter bypasses its ratio and window rules for them, the `maxCommentsPerGame` cap in `post-write-pipeline.ts` keeps all of them before filling optional slots by priority, and the redundancy filter downgrades them to brief references instead of dropping them. An annotated game that is silent on a blunder is broken output.

- Earned by: PRs #90 and #93 (games coming back with zero or missing annotations).
- Pinned by: the `maxCommentsPerGame cap` suite in `packages/llm/src/__tests__/post-write-pipeline.test.ts` and mandatory-bypass tests in `packages/llm/src/__tests__/density.test.ts` and `packages/llm/src/__tests__/redundancy.test.ts`.

### 4.5 Do not re-explain an idea inside the redundancy window

**A recently explained idea gets a brief reference or nothing, not a second essay.** The windows live in `packages/llm/src/narration/redundancy.ts` (`minPlyGapForReexplain`) and `packages/llm/src/memory/idea-tracker.ts` (`reexplainThreshold`, relevance decay). Idea keys are the currency here: intents that share keys are "the same idea" to the filter, so keep keys honest when adding intent types.

- Earned by: the #96-#99 quality rounds, where the same motif got narrated three times in five moves.
- Pinned by: `packages/llm/src/__tests__/redundancy.test.ts`.

## 5. Variations earn their place

### 5.1 Bare variations are dropped unless they demonstrate an annotated move

**The meaningful-variation filter in `packages/pgn/src/transformer/dag-transformer.ts` drops side lines whose first move has no comment, no NAGs, and no nested lines.** The one exception is the keep-rule: a bare variation branching right after a pipeline-annotated move is the engine's demonstration line for that move, so it stays. A page of unexplained parenthetical moves is noise, not coaching.

- Earned by: PR #98 (filter introduced), PR #99 (relaxed to preserve NAG-bearing lines), and the 2026 cleanup (the `entryMoveAnnotated` keep-rule).
- Pinned by: the `meaningful-variation filter` suite in `packages/pgn/src/__tests__/dag-transformer.test.ts`.

### 5.2 Every emitted line is a real engine line with no skipped moves

**Variation extraction must chain PV children to their true parents.** Before the fix, extracted variations silently skipped intermediate moves, producing lines that were illegal or nonsensical on the board. If a rendered variation cannot be played out move by move from its branch point, that is a correctness bug, not a style issue.

- Earned by: the 2026 cleanup (PV parent chaining in `packages/core/src/exploration/priority-queue-explorer.ts`).
- Pinned by: `packages/core/src/__tests__/priority-queue-explorer.test.ts` and `packages/llm/src/__tests__/engine-driven-explorer.test.ts`.

## 6. Summaries

### 6.1 One summary per game, rendered as the PGN game comment, never silently dropped

**`generateGameSummary` in `packages/llm/src/narration/game-summary.ts` makes one LLM call per game; on any failure or empty response it returns `buildTemplateSummary` instead.** The summary lands as `game.gameComment` via `packages/pgn/src/transformer/analysis-transformer.ts`, gated by `output.includeSummary`. The template fallback is the contract: a user with summaries enabled always gets one, and a fallback always emits a warning so the drop is visible.

- Earned by: the 2026 cleanup, which gave Ultra-Fast Coach summary parity with the removed legacy pipeline.
- Pinned by: `should include summary when configured` and `should exclude summary when configured` in `packages/cli/src/__tests__/integration/config-variations.integration.test.ts`.

## Boundary

This doc stops where the board begins. If your question is "is this SAN/ply/eval correct," that is [analysis-conventions.md](analysis-conventions.md). If your question is "how many LLM calls or engine seconds does this cost," that is [performance-conventions.md](performance-conventions.md). This doc answers "will a human enjoy reading this and trust it."

## Review checklist

Work through these in order. Run the commands; do not eyeball.

1. **Prompt-text changes under narration require a full read.** Any hit means reading the entire post-change file, not the hunk:

   ```bash
   git diff origin/main...HEAD -- packages/llm/src/narration | grep -inE '^\+.*(prompt|guideline)'
   ```

2. **New numeric length literals near comments.** New word counts must trace back to `MAX_WORDS_PER_COMMENT` or the `buildPrompt` length guidance (rule 2.1):

   ```bash
   git diff origin/main...HEAD -- packages/llm/src packages/cli/src | grep -nE '^\+.*(words|Words|length).*[0-9]{2}'
   ```

3. **UCI in changed test fixtures or goldens.** Hits in `packages/pgn/src/__tests__/dag-transformer.test.ts` are the intentional leak-defense fixtures (rule 3.1); hits anywhere else are suspect:

   ```bash
   git diff origin/main...HEAD --name-only -- 'packages/*/src/__tests__' | xargs grep -lE '"[a-h][1-8][a-h][1-8][qrbnQRBN]?"'
   ```

4. **Positive adjectives in blunder/mistake prompt paths** (rule 1.2). Any hit inside `blunder_explanation` or `what_was_missed` handling is a violation:

   ```bash
   grep -nE 'brilliant|great|excellent' packages/llm/src/narration/*.ts packages/llm/src/annotation/*.ts
   ```

5. **Read a sample.** For any prompt change, generate or request a sample annotated PGN (`chessbeast analyze --input game.pgn --output annotated.pgn`) and read it end to end as a reader, not a diff reviewer.

6. **Run the pins:**

   ```bash
   pnpm --filter @chessbeast/llm test
   pnpm --filter @chessbeast/pgn test
   ```
