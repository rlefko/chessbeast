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
} from '@chessbeast/core';
import type { EcoClient, LichessEliteClient } from '@chessbeast/database';
import type { StockfishClient, MaiaClient } from '@chessbeast/grpc-client';

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
        pv: result.bestLine,
      };
      if (result.mate !== 0) {
        eval_.mate = result.mate;
      }
      return eval_;
    },

    async evaluateMultiPv(
      fen: string,
      depth: number,
      numLines: number,
    ): Promise<EngineEvaluation[]> {
      const result = await client.evaluate(fen, { depth, multipv: numLines });

      // First line is the main result
      const firstEval: EngineEvaluation = {
        cp: result.cp,
        depth: result.depth,
        pv: result.bestLine,
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
            pv: alt.bestLine,
          };
          if (alt.mate !== 0) {
            altEval.mate = alt.mate;
          }
          results.push(altEval);
        }
      }

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
