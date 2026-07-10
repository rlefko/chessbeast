# Performance Conventions

**Prime directive: the pipeline is engine-bound and LLM-bound. Never add per-position work inside exploration loops, never serialize independent LLM calls, and never spend deep engine budget on positions that have not earned it.**

Every rule below was earned by a real regression. PRs #96 through #100 fixed annotation quality and silently added hundreds of `ChessPosition` instantiations per game; PR #101 clawed the speed back. PR #102 found comment generation running one LLM call at a time and got a 5-10x speedup by parallelizing it. Do not relearn these.

## 1. Hot-loop discipline

### 1.1 Create a `ChessPosition` once and advance it. Never instantiate one per node or per PV move.

Constructing a `ChessPosition` parses a FEN and rebuilds board state. Inside exploration, that happens per PV move times per node times per critical moment, and it dominated the profile. Earned by PR #101, which fixed the regression PRs #96-#100 introduced.

The pattern to copy: `addChildrenFromPV` in `packages/core/src/exploration/priority-queue-explorer.ts` builds one position from the parent FEN and calls `position.move()` to walk the PV. The mainline build in `packages/cli/src/orchestrator/ultra-fast-coach-runner.ts` does the same with `moveWithUci()`.

Pinned by `packages/core/src/__tests__/priority-queue-explorer.test.ts` and `packages/pgn/src/__tests__/position.test.ts`.

### 1.2 Carry UCI and SAN together from the adapter. Never re-derive one from the other downstream.

The CLI engine adapter (`packages/cli/src/orchestrator/adapters.ts`) converts engine UCI PVs to SAN exactly once via `ChessPosition.convertPvToSan`. Downstream, `moveWithUci()` (`packages/pgn/src/chess/position.ts`) returns both notations in one operation, avoiding the move/undo overhead of a separate `sanToUci()` call. Re-deriving notation in a loop is how PR #101's regression started. Earned by PR #101.

Pinned by `packages/pgn/src/__tests__/position.test.ts`.

### 1.3 Format checks on hot paths are guards that warn, not converters that fix.

`isUciMove()` checks in `packages/core/src/exploration/priority-queue-explorer.ts` and `packages/llm/src/explorer/engine-driven-explorer.ts` log and bail when they see UCI where SAN belongs. They exist to catch upstream bugs, not to paper over them: a silent conversion hides the defect and adds per-move cost forever. Earned by PR #101, which converted defensive conversions into warnings. For what the notations mean and where the boundary sits, see docs/analysis-conventions.md.

## 2. LLM fan-out

### 2.1 Independent LLM calls run through `pLimit`. Never `await` them one at a time in a loop.

The Narrator (`packages/llm/src/narration/narrator.ts`) generates comments in parallel with `pLimit`, concurrency default 5. Before PR #102 it awaited each comment sequentially; parallelizing was a 5-10x wall-clock win on annotation. Any new fan-out over independent items (intents, positions, summaries) uses the same pattern. Earned by PR #102.

Pinned by `packages/llm/src/__tests__/narrator.test.ts` (concurrency limit tests).

### 2.2 Every new LLM call site is metered.

Cost flows through `getModelPricing` and `calculateCost` in `packages/llm/src/cost/pricing.ts`, which feed the `cost` field on `llm:stream_end` events and the Debug GUI cost display. An unmetered call site makes the cost readout a lie and hides budget regressions. If you add a call path, confirm its usage lands in the response cost accounting in `packages/llm/src/client/openai-client.ts`.

### 2.3 One `llm:stream_start` per request.

The client emits `llm:stream_start` once per request in `doChat`; the streaming helper must not emit it again. Double emission made the Debug GUI stream panel show phantom requests and inflated apparent fan-out. Fixed in the 2026 cleanup; the contract is documented at the `doChatStreaming` boundary in `packages/llm/src/client/openai-client.ts`.

## 3. Engine budget

### 3.1 Analysis is tiered by design. New engine work maps to a named tier, never an ad hoc depth.

Two layers of tiering exist on purpose: the core two-pass pipeline (`packages/core/src/pipeline/analysis-pipeline.ts`, shallow pass for every ply, deep pass only for critical moments) and the Ultra-Fast Coach exploration tiers (depths 12/18/22 in `getUltraFastTierConfig` in `packages/cli/src/orchestrator/ultra-fast-coach.ts`). A hardcoded `depth: 25` in a feature branch bypasses every budget decision the tier config encodes. Add a tier or change the config; do not scatter literals.

Pinned by `packages/cli/src/__tests__/config-defaults.test.ts` and `packages/core/src/__tests__/analysis-pipeline.test.ts`.

### 3.2 Exploration budgets are named constants in the derivation layer.

`EXPLORATION_BUDGET_MS_FULL` and `EXPLORATION_BUDGET_MS_DEFAULT` live in `packages/cli/src/orchestrator/ultra-fast-coach.ts`. Time budgets buried in call sites cannot be reviewed, tuned, or explained to users. New budgets get a named constant next to those.

### 3.3 Expensive evaluations go through the `ArtifactCache`.

`exploreNode` in `packages/core/src/exploration/priority-queue-explorer.ts` checks `getCachedEval` before calling the engine and caches the result after. Transpositions are common; an uncached call path re-buys the same evaluation at full depth. The cache lives in `packages/core/src/storage/cache/` (`artifact-cache.ts`). If your new code calls `evaluateMultiPv`, it consults the cache first or explains why it cannot.

Pinned by `packages/core/src/__tests__/priority-queue-explorer.test.ts` (real artifact cache round-trip tests).

### 3.4 Engine handles come from the pool, with acquire/release and timeouts.

The Stockfish services hand out engines via a pool with `acquire(timeout)`, `release()`, and a context manager (`services/stockfish/src/stockfish_service/pool.py`, mirrored in `services/stockfish16/src/stockfish16_service/pool.py`). Spawning engines outside the pool or holding a handle across an await-shaped boundary starves everyone else. Hardened in the PR #66 era.

Concurrency behavior pinned by `services/stockfish/tests/test_pool_concurrency.py`.

## 4. Regressions are measured, not eyeballed

**Any change that plausibly affects throughput cites a before/after `make test-benchmark` run in its PR description.**

The benchmarks live in `tests/benchmarks/` (`profile-comparison.test.ts`). The cautionary tale is the PR #96-#101 sequence: five quality PRs each looked harmless, none was measured, and together they regressed the pipeline badly enough to need a dedicated performance fix. "Plausibly affects throughput" means anything touching exploration, narration, the annotation pipeline, the orchestrator, the LLM client, or the engine services.

## 5. The GUI must not slow the pipeline

**Debug GUI observability is free when disabled and cheap when enabled.**

Three mechanisms enforce this, all from the 2026 cleanup's GUI overhaul:

- Engine analysis events are throttled: `ENGINE_ANALYSIS_THROTTLE_MS = 100` in `packages/cli/src/orchestrator/adapters.ts`. Emitting per engine info line would flood the socket.
- LLM stream chunks are batched client-side: `LLM_CHUNK_FLUSH_MS = 50` in `packages/debug-gui/src/client/state/store.ts`, so React renders per flush, not per token.
- The emitter is a no-op when the GUI is disabled: `packages/debug-gui/src/server/event-emitter.ts` returns early on `!this.enabled`, so the production path pays a boolean check.

New event types follow all three: throttle or batch anything high-frequency, and never do work before the enabled check.

Pinned by `packages/debug-gui/src/__tests__/event-emitter.test.ts` and `packages/debug-gui/src/__tests__/store.test.ts`.

## Boundary

This document owns speed and budget: hot loops, LLM fan-out, engine budget, and measurement. Chess correctness (notation, plies, perspective signs, eval semantics, failure handling) belongs to docs/analysis-conventions.md. How the output reads (voice, token budgets, density, honesty) belongs to docs/annotation-conventions.md. Do not restate their rules here; reference them by section.

## Review checklist

Run these against the change under review. Work in order; each command is mechanical, but every hit needs the surrounding post-change code read before it counts as a finding.

1. **New position constructions (rule 1.1).** Flag any construction inside a per-node, per-move, or per-PV loop:

   ```bash
   git diff origin/main...HEAD -- 'packages' | grep -nE '^\+.*new ChessPosition\('
   ```

   For each hit, open the file and find the enclosing loop. Construction once per line or per game is fine; construction per iteration is not.

2. **Serialized awaits over independent items (rule 2.1).** Find new loops, then read their bodies for `await` on items that do not depend on each other:

   ```bash
   git diff origin/main...HEAD -U6 -- 'packages' | grep -nE '^\+.*\b(for|while)\s*\('
   ```

   Independent LLM or network calls inside such a loop belong behind `pLimit`.

3. **Ad hoc engine depth or multipv literals (rules 3.1, 3.2).** The tier config is the only production home for these numbers:

   ```bash
   git diff origin/main...HEAD -- 'packages' ':(exclude)packages/cli/src/orchestrator/ultra-fast-coach.ts' | grep -nE '^\+.*(depth|multipv|multiPv):\s*[0-9]+'
   ```

   Hits in test files and fixtures are fine. Hits in `packages/core/src/pipeline/analysis-pipeline.ts` defaults are fine if the defaults themselves are the change under review. Anything else maps to a named tier or gets rejected.

4. **Cache bypasses (rule 3.3).** Find new engine call sites and confirm each sits behind a cache check:

   ```bash
   git diff origin/main...HEAD -- 'packages' | grep -nE '^\+.*evaluateMultiPv\('
   ```

   For each hit, verify the caller consults `getCachedEval` (or an equivalent `ArtifactCache` read) first and stores the result after.

5. **Benchmark citation (rule 4).** If the diff touches `packages/core/src/exploration`, `packages/core/src/storage`, `packages/llm/src/narration`, `packages/llm/src/annotation`, `packages/llm/src/client`, `packages/cli/src/orchestrator`, `packages/debug-gui/src/server`, or any `pool.py` under `services/`, the PR description must include before/after numbers from `make test-benchmark`. No numbers, no merge.
