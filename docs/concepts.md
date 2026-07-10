# Concepts

This is the project vocabulary. When a term appears in code, prompts, or docs it means exactly this, with the defining code path listed so you can check the source of truth. Terms are grouped by pipeline stage: evaluation and selection, exploration, narration, then notation and voice. If a definition here ever disagrees with the code, the code wins and this file gets fixed.

## Evaluation and selection

### Win probability

The evaluation currency of the pipeline. Centipawn scores are converted through a sigmoid (en-croissant style) into a 0-100 win chance in `packages/core/src/classifier/win-probability.ts`, and move quality is judged by win-chance drop, not raw centipawns: more than 20 points lost is a blunder, more than 10 a mistake, more than 5 dubious (`WIN_PROB_THRESHOLDS`). This captures positional context that centipawn thresholds miss, since 100cp matters far more in an equal position than in a won one.

### Critical moment

A position selected for deep analysis and annotation because the game meaningfully changed there. Detection is win-probability based (since PR #74) in `packages/core/src/classifier/critical-moment-detector.ts`, which also assigns the move NAG from the same win-probability calculation. Moments are ranked by criticality score, require a minimum score of 30, and are capped at `maxCriticalRatio` (default 25% of moves).

### Criticality score

A 0-100 score measuring how much a position deserves attention, computed in `packages/core/src/classifier/criticality-scorer.ts` from multiple factors: win-probability delta, centipawn delta, tactical volatility, theme novelty, king safety risk, and a repetition penalty. It has two consumers, and changes must respect both: critical-moment selection ranks and caps moments by it, and the priority-queue explorer (`packages/core/src/exploration/priority-queue-explorer.ts`) uses it to order exploration and recommend analysis tiers and MultiPV. A score that inflates for one consumer distorts the other.

## Exploration

### Ultra-Fast Coach

The annotation pipeline, and since the 2026 cleanup the only one. The name describes the design: the engine explores everything first at staged depths (post-write annotation), and the LLM narrates afterward, so no LLM round trips block the search. The `--ultra-fast-coach` CLI flag is a deprecated no-op kept for compatibility; the runner is `packages/cli/src/orchestrator/ultra-fast-coach-runner.ts` and config derivation lives in `packages/cli/src/orchestrator/ultra-fast-coach.ts`.

### Variation DAG

The shared store for explored lines: a directed acyclic graph, not a tree, so positions reached by different move orders share a node (`packages/core/src/storage/variation-dag/`, see the multi-parent edges in `node.ts`). The engine-driven explorer writes into it during exploration, and `packages/pgn/src/transformer/dag-transformer.ts` renders it back into PGN mainline and variations with comments and NAGs attached.

### Theme and theme lifecycle

A theme is a detected positional or tactical feature (pin, fork, back-rank weakness, pawn-structure issue, and so on) identified by detectors in `packages/llm/src/themes/detectors/`. Each instance carries a `themeKey` in the format `type:primarySquare:beneficiary` (see `generateThemeKey` in `packages/llm/src/themes/types.ts`), which is how the lifecycle tracker matches themes across positions. The lifecycle (`packages/llm/src/themes/lifecycle.ts`) assigns one of five statuses: `emerged`, `persisting`, `escalated`, `resolved`, or `transformed`. Novelty decays as a theme persists, so annotations mention a theme when it appears or changes, not on every move it sits on the board.

## Narration

### Comment intent

A structured reason to write a comment, produced by the explorer before any LLM call. The ten `CommentIntentType` values in `packages/llm/src/narration/intents.ts` are: `why_this_move`, `what_was_missed`, `tactical_shot`, `strategic_plan`, `endgame_technique`, `human_move`, `theme_emergence`, `theme_resolution`, `critical_moment`, and `blunder_explanation`. Intents are scored, density-filtered, capped, and only then narrated. An intent's `plyIndex` uses the after-move convention: it names the ply whose move the comment follows in the PGN.

### Density

The user's contract for how much commentary they get: `sparse`, `normal`, or `verbose`, set with `--comment-density` and defined as `DensityLevel` in `packages/llm/src/narration/density.ts`. Density controls which intents survive filtering; it never changes what the surviving comments say. If output feels too chatty or too thin at a given level, fix the density configs, not the narrator.

### Audience level

Who the annotations are written for: `beginner`, `club`, or `expert`, set with `--audience`. The canonical `AudienceLevel` type lives in `packages/llm/src/narration/narrator.ts`, where it shapes the system prompt; it also drives derived settings like whether evaluations are shown (hidden for beginners) and line-memory sizing.

### Annotation perspective

Whose point of view the language takes: `neutral`, `white`, or `black`, set with `--perspective` (`AnnotationPerspective` in `packages/llm/src/narration/narrator.ts`). Perspective controls we/they framing only: from White's perspective, White is "we" and Black is "they". It never changes evaluation content; a blunder is a blunder no matter whose side we are narrating.

### Game summary

The paragraph summarizing the whole game, generated by `generateGameSummary` in `packages/llm/src/narration/game-summary.ts`. When no LLM client is available, or the LLM returns nothing, `buildTemplateSummary` produces a deterministic template summary instead, so the output PGN always has one.

## Notation and voice

### UCI vs SAN, and the one-conversion boundary

Engines speak UCI (`e2e4`, `e7e8q`); PGN and everything the LLM sees speak SAN (`e4`, `e8=Q`). The single notation boundary is `ChessPosition` in `packages/pgn/src/chess/position.ts` (`isUciMove`, `uciToSan`, which also normalizes uppercase promotion letters like `e7e8Q`), and the CLI engine adapter (`packages/cli/src/orchestrator/adapters.ts`) converts engine PVs to SAN exactly once on the way in. Downstream code assumes SAN; a UCI string past the adapter is a bug (see PRs #91 and #100 for what happens otherwise). The full notation rules live in [analysis-conventions](analysis-conventions.md).

### Coach voice

The register all narration is written in: a coach explaining ideas, showing rather than telling. Concretely, comments explain the idea behind a move instead of announcing that a move is interesting, and they never pad with meta-commentary. The rules and examples are owned by [annotation-conventions](annotation-conventions.md); this entry only names the term.
