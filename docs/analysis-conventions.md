# Analysis Conventions

**Prime directive:** Every move string, eval, and ply index has exactly one owner and one declared perspective. Convert at the boundary, once; downstream code trusts the format. When data is bad, fail loudly: a skipped annotation is recoverable, a silently wrong one is not.

This doc owns chess correctness: notation (UCI vs SAN), ply indexing and placement, perspective signs on evals and NAGs, eval semantics, and failure handling. How the output reads (voice, budgets, density, honesty) lives in [annotation-conventions.md](annotation-conventions.md). Speed and cost (hot loops, LLM fan-out, engine budget) live in [performance-conventions.md](performance-conventions.md). Do not restate their rules here; reference them by section.

Every rule below was earned by a real defect that shipped. The "Earned by" line tells you which one. The "Pinned by" line tells you which test will catch a regression, so if you change the behavior, change the pin in the same PR.

## 1. Notation boundaries

### 1.1 The engine adapter converts UCI to SAN exactly once

**The CLI engine adapter is the only place engine UCI becomes SAN.** `convertPvToSan` in `packages/cli/src/orchestrator/adapters.ts` wraps `ChessPosition.convertPvToSan` and is the single UCI-to-SAN crossing for engine output; everything downstream receives SAN and treats it as final. Converting a second time re-walks the board from a wrong assumption and produces moves that never happened, which is exactly how candidate building broke.

- Earned by: PR #91, which fixed a UCI/SAN mismatch in candidate building caused by double conversion.
- Pinned by: `ChessPosition.convertPvToSan` in `packages/pgn/src/chess/position.ts`, pinned by the conversion tests in `packages/pgn/src/__tests__/position.test.ts`.

### 1.2 Carry UCI and SAN together; never re-derive one from the other

**When you make a move, take both notations from the same operation.** `ChessPosition.moveWithUci` (`packages/pgn/src/chess/position.ts`) returns `{ san, uci, fenBefore, fenAfter }` in one call, so a move descriptor never has to reconstruct its UCI (or its SAN) from the other later. Re-deriving invites a second, divergent conversion and a second chance to be wrong.

- Earned by: PRs #100 and #101, which introduced `moveWithUci` so the mainline build carries both notations without a separate `sanToUci` round trip.
- Pinned by: the `moveWithUci` cases in `packages/pgn/src/__tests__/position.test.ts`.

### 1.3 A failed SAN conversion skips the move and never emits raw UCI

**Raw UCI in rendered output is a bug, not a fallback.** A move whose SAN conversion fails is dropped, never rendered as `f5g7`. The last-line backstop is the UCI-leak guard in `packages/pgn/src/transformer/dag-transformer.ts`: it runs `isUciMove` on `edge.san`, converts a leaked UCI string back to SAN and logs loudly, and if the leaked string is illegal in the from-position it keeps the original and logs an error without throwing. A warning from this guard means an upstream boundary (rule 1.1) failed and must be fixed there, not here.

- Earned by: PRs #96 and #97 (the quality arc where UCI leaked into comments and candidates); the guard itself pins PR #100.
- Pinned by: the `UCI-leak defense in edge.san` suite in `packages/pgn/src/__tests__/dag-transformer.test.ts` (whose UCI-shaped fixtures are intentional; do not "fix" them).

### 1.4 Uppercase promotion UCI is detected and normalized at conversion

**`e7e8Q` and `e7e8q` are the same move; conversion must accept both.** `uciToSan` in `packages/pgn/src/chess/position.ts` lowercases the promotion suffix before handing it to chess.js, which only accepts lowercase promotion pieces. Without the normalization an uppercase-promotion UCI throws instead of converting, and the promotion move silently disappears.

- Earned by: the class of promotion defects from PR #98, fixed in the 2026 cleanup.
- Pinned by: `roundtrips queen promotion and normalizes UPPERCASE promotion UCI (e7e8Q)` in `packages/pgn/src/__tests__/position.test.ts`.

### 1.5 There is exactly one UCI detector

**Use `isUciMove` from `@chessbeast/pgn`; do not hand-roll a regex.** It is defined in `packages/pgn/src/chess/position.ts` and re-exported from the package index. Every "is this string UCI or SAN" decision (the transformer guard in rule 1.3, the explorer format guards) routes through it, so a leaked-notation bug is caught the same way everywhere. A second detector with slightly different rules is a second definition of correct.

- Earned by: the UCI-leak arc (PRs #96 through #100), which consolidated the format check into one exported function.
- Pinned by: `isUciMove` usage in `packages/pgn/src/transformer/dag-transformer.ts`, pinned by `packages/pgn/src/__tests__/dag-transformer.test.ts`.

## 2. Ply indexing and placement

### 2.1 `plyIndex` is 0-based and attaches to the resulting position (after-move convention)

**A comment about a move lands on the ply of the position that move produces, not the position it came from.** Across the pipeline, an intent's `plyIndex` is the after-move ply: `EngineDrivenExplorer` sets it to `gamePly + 1` (and `movePly + 1` for descendants) in `packages/llm/src/explorer/engine-driven-explorer.ts`, and the DAG transformer reads it back as `moves[plyIndex - 1]`. Mixing the before-move and after-move conventions put every mainline comment one move early.

- Earned by: the placement class from PR #95, unified onto the single after-move convention in the 2026 cleanup.
- Pinned by: `packages/llm/src/__tests__/engine-driven-explorer.test.ts` and the placement tests in `packages/pgn/src/__tests__/dag-transformer.test.ts`.

### 2.2 Exploration depth is never a game ply

**Search depth and game ply are different axes; do not use one for the other.** How deep the explorer has walked a variation says nothing about which move number a position sits at in the actual game. The real game ply is threaded in explicitly: `EngineDrivenExplorer.explore` takes a `gamePly` argument and stores it as `currentGamePly` (`packages/llm/src/explorer/engine-driven-explorer.ts`), rather than inferring position from exploration depth. Deriving a ply from depth produces comments attached to positions that do not exist in the game.

- Earned by: the same after-move-ply unification in the 2026 cleanup, which threaded `gamePly` through explicitly instead of reusing depth.
- Pinned by: `packages/llm/src/__tests__/engine-driven-explorer.test.ts`.

## 3. Perspective and NAG signs

### 3.1 Convert engine evals to the declared perspective before assigning a symbol

**Pick the perspective first, then read the sign.** An engine eval is meaningless until you say whose perspective it is from; symbol and NAG assignment happen only after the conversion. Assigning `?` or `+/-` off a raw, side-to-move eval flips the sign for Black and praises a losing move.

- Earned by: PR #72, which fixed NAG symbol perspective.
- Pinned by: `packages/pgn/src/__tests__/nag.test.ts`.

### 3.2 NAGs and critical moments derive from win probability, not raw centipawn swings

**A swing that matters is a swing in win probability, not in centipawns.** `criticalityScore` in `packages/core/src/classifier/critical-moment-detector.ts` computes a win-probability drop (`calculateWinProbDrop`) rather than differencing centipawns, which is why a 200cp change near +8 is noise and the same change near 0 is a crisis. New criticality or NAG logic works in win-probability space for the same reason.

- Earned by: PR #74, which refactored critical moment detection to use win probability.
- Pinned by: `packages/core/src/__tests__/critical-moment-detector.test.ts`.

### 3.3 Every eval consumer names its perspective convention at the call site

**`packages/pgn/src/nag/nag-validator.ts` deliberately hosts two conventions; the caller must say which it is feeding.** `evalToPositionNag` expects White-perspective input (positive cp always means White is better). `evalToVerbalDescription` takes an explicit side-to-move flag and reads the sign relative to the mover. Both are correct and both are pinned; the danger is a new consumer that assumes one and gets the other. Name the convention at the call site so the reader does not have to guess.

- Earned by: PR #72, which is why the two conventions are documented and tested side by side rather than silently coexisting.
- Pinned by: the `evalToPositionNag (White-perspective convention)` and `evalToVerbalDescription` suites in `packages/pgn/src/__tests__/nag.test.ts`.

## 4. Eval semantics

### 4.1 Classification thresholds are rating-dependent; never hardcode centipawn cutoffs elsewhere

**`RATING_THRESHOLDS` in `packages/core/src/classifier/thresholds.ts` is the only home for blunder/mistake/good cutoffs.** The bands are deliberately more lenient for lower-rated players and stricter for higher-rated ones, so a bare `if (cp > 300)` in another file is both wrong for most players and invisible to anyone tuning the bands. New classification logic reads its cutoff from the thresholds table.

- Earned by: the rating-band classification design; the thresholds table is the single derivation layer for these numbers.
- Pinned by: `packages/core/src/__tests__/thresholds.test.ts`.

### 4.2 SF16 classical eval parsing terminates on the Total line, not a blank line

**The classical eval block ends at the `Total` row.** The `services/stockfish16` classical service reads Stockfish's `eval` output until it sees the `Total` line (`if "Total" in line and "Term" not in line` in `services/stockfish16/src/stockfish16_service/engine.py`), because the output has no trailing blank line to stop on. Waiting for a blank line hangs until the read times out.

- Earned by: PR #76, which fixed an SF16 eval timeout caused by the wrong line check.
- Pinned by: `services/stockfish16/tests/test_eval_parser.py` against `eval_parser.py`.

## 5. No silent failures

### 5.1 Engine-evaluation failures surface through `onWarning`

**A failed evaluation is isolated so exploration continues, but it must reach the runner's warnings.** `exploreNode` in `packages/core/src/exploration/priority-queue-explorer.ts` catches an engine failure, calls `this.onWarning?.(...)`, and returns `undefined`; the runner wires that callback into its `warnings` array in `packages/cli/src/orchestrator/ultra-fast-coach-runner.ts`. Swallowing the failure would ship a game that is quietly missing analysis with no signal that anything went wrong.

- Earned by: the silent-failure class from PR #94, wired end to end in the 2026 cleanup.
- Pinned by: `surfaces engine failures through the onWarning callback` in `packages/core/src/__tests__/priority-queue-explorer.test.ts` and `surfaces LLM failures as warnings and falls back without dropping other annotations` in `packages/cli/src/__tests__/integration/ultra-fast-coach.integration.test.ts`.

### 5.2 Callbacks are isolated so a throwing callback cannot abort exploration

**Observer callbacks are wrapped; a bad observer degrades observability, not the run.** The node-explored callback in `packages/core/src/exploration/priority-queue-explorer.ts` runs inside a try/catch that logs the callback error and keeps exploring. A callback that throws (a Debug GUI emitter, a progress hook) must never take the analysis down with it.

- Earned by: the PR #94 error-handling hardening.
- Pinned by: `does not stop the exploration loop when onNodeExplored throws` in `packages/core/src/__tests__/priority-queue-explorer.test.ts`.

### 5.3 Fail fast on corrupt DAG data instead of storing a bad edge

**A move that is illegal in its from-position is a data bug; throw, do not persist it.** `packages/core/src/storage/variation-dag/dag-manager.ts` logs a `[DAG] CRITICAL` error and throws when a move will not convert against the current node's position, rather than writing an edge that renders as garbage later. A stored bad edge turns one upstream mistake into a corrupt variation tree that fails far from its cause.

- Earned by: PR #100, which hardened DAG edge construction against illegal moves.
- Pinned by: `throws on an illegal UCI-shaped move and leaves the DAG uncorrupted` in `packages/core/src/__tests__/variation-dag.test.ts`.

### 5.4 The played move is always added as a candidate first

**Whatever else the explorer considers, the move actually played is candidate zero.** `buildInitialCandidates` in `packages/llm/src/explorer/engine-driven-explorer.ts` adds the played move first to guarantee at least one candidate and at least one annotatable line, even when the engine's own suggestions are unusable. A game that comes back with no comment on a move because the played move was never queued is broken output.

- Earned by: PR #92, which fixed candidate building order.
- Pinned by: `packages/llm/src/__tests__/engine-driven-explorer.test.ts`.

### 5.5 Nodes are counted when processed, not when evaluation succeeds

**`nodesExplored` measures work attempted, so stopping conditions stay honest under failure.** `packages/core/src/exploration/priority-queue-explorer.ts` increments `nodesExplored` when a node is dequeued for processing, before evaluation, so a run of engine failures still advances the budget and cannot spin forever retrying. Counting only successful evaluations lets a flaky engine defeat every node-based stopping condition.

- Earned by: PR #93, which fixed intent generation and node counting.
- Pinned by: `packages/core/src/__tests__/priority-queue-explorer.test.ts`.

## Boundary

This doc stops where reading and cost begin. If your question is "will a human enjoy this comment and trust it," that is [annotation-conventions.md](annotation-conventions.md). If your question is "how many LLM calls or engine seconds does this cost," that is [performance-conventions.md](performance-conventions.md). This doc answers "is the SAN, the ply, the eval sign, and the failure handling correct."

## Review checklist

Work through these in order. Run the commands; do not eyeball. Every hit needs the surrounding post-change code read before it counts as a finding.

1. **New `uciToSan`/`sanToUci` call sites outside `packages/pgn` and the adapter (rules 1.1, 1.2).** The notation boundary is the adapter; new conversions elsewhere are a second boundary:

   ```bash
   git diff origin/main...HEAD -- 'packages' ':(exclude)packages/pgn' ':(exclude)packages/cli/src/orchestrator/adapters.ts' | grep -nE '^\+.*\b(uciToSan|sanToUci)\('
   ```

   Existing hits live in the pipeline, the explorer, and the DAG manager. A new one must justify why it is not `moveWithUci()` or `ChessPosition.convertPvToSan` at the adapter.

2. **Empty catch blocks added in the diff (rule 5.1).** A swallowed error is a silent failure until proven otherwise:

   ```bash
   git diff origin/main...HEAD -- 'packages' 'services' | grep -nE '^\+.*catch.*\{\s*\}'
   ```

   Read each hit in context: an isolated failure is fine only if it reaches `onWarning` (or the runner's warnings). A multi-line empty catch will not match this grep, so also scan any new `catch` you see for a missing `onWarning` path.

3. **New `plyIndex` arithmetic requiring a stated basis comment (rule 2.1).** Any `plyIndex + 1` or `plyIndex - 1` must say which convention it is crossing:

   ```bash
   git diff origin/main...HEAD -- 'packages' | grep -nE '^\+.*plyIndex\s*[-+]\s*[0-9]'
   ```

   For each hit, confirm a nearby comment states the before/after basis (the after-move convention). Bare ply arithmetic with no stated basis is how the one-move-early bug returns.

4. **New centipawn comparisons outside `thresholds.ts` (rule 4.1).** Hardcoded cutoffs belong only in the rating-band table:

   ```bash
   git diff origin/main...HEAD -- 'packages/core/src' ':(exclude)packages/core/src/classifier/thresholds.ts' | grep -nE '^\+.*\bcp\w*\b\s*[<>]=?\s*-?[0-9]'
   ```

   A new cutoff maps to `RATING_THRESHOLDS` or gets rejected. Win-probability comparisons (rule 3.2) are fine; hardcoded centipawn ones are not.

5. **Read the full post-change file around any ply or eval arithmetic.** Perspective, ply basis, and eval sign all change meaning through context a hunk hides. For any diff that touches placement, NAG assignment, or criticality, read the enclosing function, not the hunk.

6. **Run the pins:**

   ```bash
   pnpm --filter @chessbeast/core --filter @chessbeast/pgn test
   ```
