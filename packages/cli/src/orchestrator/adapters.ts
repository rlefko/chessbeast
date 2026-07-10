/**
 * Adapters to convert service clients to pipeline interfaces
 */

import type {
  EngineService,
  MaiaService,
  OpeningService,
  ReferenceGameService,
  OpeningLookupResult,
  ReferenceGameInfo,
  EngineEvaluation,
  EvaluationOptions,
} from '@chessbeast/core';
import type { EcoClient, LichessEliteClient } from '@chessbeast/database';
import { debugGuiEmitter } from '@chessbeast/debug-gui';
import type { StockfishClient, MaiaClient } from '@chessbeast/grpc-client';
import { ChessPosition } from '@chessbeast/pgn';

/** Minimum interval between engine:analysis Debug GUI emissions */
const ENGINE_ANALYSIS_THROTTLE_MS = 100;

/** Module-local timestamp of the last engine:analysis emission */
let lastEngineAnalysisEmitAt = 0;

/**
 * Emit a throttled engine:analysis event to the Debug GUI.
 * No-ops when the emitter is disabled or the last emission was <100ms ago.
 */
function emitEngineAnalysisThrottled(fen: string, evaluations: EngineEvaluation[]): void {
  if (!debugGuiEmitter.isEnabled()) return;
  const main = evaluations[0];
  if (!main) return;

  const now = Date.now();
  if (now - lastEngineAnalysisEmitAt < ENGINE_ANALYSIS_THROTTLE_MS) return;
  lastEngineAnalysisEmitAt = now;

  const toEventEval = (e: EngineEvaluation): { cp?: number; mate?: number } => ({
    ...(e.cp !== undefined ? { cp: e.cp } : {}),
    ...(e.mate !== undefined ? { mate: e.mate } : {}),
  });

  debugGuiEmitter.engineAnalysis({
    fen,
    depth: main.depth,
    nodes: 0, // Node counts are not reported by the gRPC evaluate API
    evaluation: toEventEval(main),
    pv: main.pv,
    ...(evaluations.length > 1
      ? {
          multipv: evaluations.map((e, idx) => ({
            rank: idx + 1,
            move: e.pv[0] ?? '?',
            evaluation: toEventEval(e),
            pv: e.pv,
          })),
        }
      : {}),
  });
}

/**
 * Convert UCI principal variation to SAN notation
 * @param uciPv - Array of UCI moves (e.g., ["e2e4", "e7e5"])
 * @param fen - Starting position FEN
 * @returns Array of SAN moves (e.g., ["e4", "e5"]), or empty array on conversion failure
 */
function convertPvToSan(uciPv: string[], fen: string): string[] {
  if (!uciPv || uciPv.length === 0) return [];
  try {
    return ChessPosition.convertPvToSan(uciPv, fen);
  } catch {
    // If conversion fails (e.g., illegal move in PV), return empty array
    // Returning UCI notation would create invalid PGN (e.g., "f5g7" instead of "Nxg7")
    console.warn(`Failed to convert PV to SAN for position ${fen}`);
    return [];
  }
}

/**
 * Adapt StockfishClient to EngineService interface
 */
export function createEngineAdapter(client: StockfishClient): EngineService {
  return {
    async evaluate(fen: string, depth: number): Promise<EngineEvaluation> {
      const result = await client.evaluate(fen, { depth, multipv: 1 });

      const eval_: EngineEvaluation = {
        cp: result.cp,
        depth: result.depth,
        pv: convertPvToSan(result.bestLine, fen),
        pvUci: result.bestLine, // Preserve original UCI to avoid expensive re-derivation
      };
      if (result.mate !== 0) {
        eval_.mate = result.mate;
      }

      emitEngineAnalysisThrottled(fen, [eval_]);

      return eval_;
    },

    async evaluateMultiPv(
      fen: string,
      depthOrOptions: number | EvaluationOptions,
      numLines?: number,
    ): Promise<EngineEvaluation[]> {
      // Handle both old signature (depth, numLines) and new signature (options object)
      let depth: number | undefined;
      let timeLimitMs: number | undefined;
      let mateMinTimeMs: number | undefined;
      let multipv: number;

      if (typeof depthOrOptions === 'number') {
        // Old signature: evaluateMultiPv(fen, depth, numLines)
        depth = depthOrOptions;
        multipv = numLines ?? 1;
      } else {
        // New signature: evaluateMultiPv(fen, options)
        depth = depthOrOptions.depth;
        timeLimitMs = depthOrOptions.timeLimitMs;
        mateMinTimeMs = depthOrOptions.mateMinTimeMs;
        multipv = depthOrOptions.numLines ?? 1;
      }

      // Build options object, only including defined values (for exactOptionalPropertyTypes)
      const options: {
        depth?: number;
        timeLimitMs?: number;
        mateMinTimeMs?: number;
        multipv: number;
      } = { multipv };
      if (depth !== undefined) options.depth = depth;
      if (timeLimitMs !== undefined) options.timeLimitMs = timeLimitMs;
      if (mateMinTimeMs !== undefined) options.mateMinTimeMs = mateMinTimeMs;

      const result = await client.evaluate(fen, options);

      // First line is the main result
      const firstEval: EngineEvaluation = {
        cp: result.cp,
        depth: result.depth,
        pv: convertPvToSan(result.bestLine, fen),
        pvUci: result.bestLine, // Preserve original UCI to avoid expensive re-derivation
      };
      if (result.mate !== 0) {
        firstEval.mate = result.mate;
      }
      const results: EngineEvaluation[] = [firstEval];

      // Add alternatives
      if (result.alternatives) {
        for (const alt of result.alternatives) {
          const altEval: EngineEvaluation = {
            cp: alt.cp,
            depth: alt.depth,
            pv: convertPvToSan(alt.bestLine, fen),
            pvUci: alt.bestLine, // Preserve original UCI to avoid expensive re-derivation
          };
          if (alt.mate !== 0) {
            altEval.mate = alt.mate;
          }
          results.push(altEval);
        }
      }

      emitEngineAnalysisThrottled(fen, results);

      return results;
    },
  };
}

/**
 * Adapt MaiaClient to MaiaService interface
 */
export function createMaiaAdapter(client: MaiaClient): MaiaService {
  return {
    async predictMoves(
      fen: string,
      rating: number,
    ): Promise<Array<{ san: string; probability: number }>> {
      const result = await client.predict(fen, rating);

      return result.predictions.map((p) => ({
        san: p.move,
        probability: p.probability,
      }));
    },

    async estimateRating(
      moves: Array<{ fen: string; san: string }>,
    ): Promise<{ rating: number; confidence: number }> {
      const gameMoves = moves.map((m) => ({
        fen: m.fen,
        playedMove: m.san,
      }));

      const result = await client.estimateRating(gameMoves);

      return {
        rating: result.estimatedRating,
        confidence: (result.confidenceHigh - result.confidenceLow) / 2,
      };
    },
  };
}

/**
 * Adapt EcoClient to OpeningService interface
 */
export function createOpeningAdapter(client: EcoClient): OpeningService {
  return {
    getOpeningByMoves(movesUci: string[]): OpeningLookupResult {
      const result = client.getOpeningByMoves(movesUci);

      const adapted: OpeningLookupResult = {
        matchedPlies: result.matchedPlies,
        isExactMatch: result.isExactMatch,
      };

      if (result.opening) {
        adapted.opening = {
          eco: result.opening.eco,
          name: result.opening.name,
          numPlies: result.opening.numPlies,
        };
      }

      if (result.leftTheoryAtPly !== undefined) {
        adapted.leftTheoryAtPly = result.leftTheoryAtPly;
      }

      return adapted;
    },
  };
}

/**
 * Adapt LichessEliteClient to ReferenceGameService interface
 */
export function createReferenceGameAdapter(client: LichessEliteClient): ReferenceGameService {
  return {
    getReferenceGames(
      fen: string,
      limit?: number,
    ): { games: ReferenceGameInfo[]; totalCount: number } {
      const result = client.getReferenceGames(fen, limit);

      const games: ReferenceGameInfo[] = result.games.map((g) => {
        const info: ReferenceGameInfo = {
          white: g.white,
          black: g.black,
          result: g.result,
        };
        if (g.whiteElo !== undefined) info.whiteElo = g.whiteElo;
        if (g.blackElo !== undefined) info.blackElo = g.blackElo;
        if (g.eco !== undefined) info.eco = g.eco;
        return info;
      });

      return {
        games,
        totalCount: result.totalCount,
      };
    },
  };
}
