/**
 * Position Card Builder
 *
 * Builds rich Position Cards by integrating data from multiple services:
 * - Stockfish (engine evaluation and candidates)
 * - Stockfish 16 (classical eval features)
 * - Maia (human move predictions)
 * - Opening database
 * - Reference games database
 */

import type { EcoClient, LichessEliteClient } from '@chessbeast/database';
import type {
  StockfishClient,
  MaiaClient,
  Stockfish16Client,
  ClassicalEvalResponse,
} from '@chessbeast/grpc-client';
import { ChessPosition } from '@chessbeast/pgn';

import type { EvaluationCache, CachedEvaluation } from '../cache/evaluation-cache.js';
import {
  classifyCandidates,
  getDefaultConfig,
  type EngineCandidate,
  type MaiaPrediction,
} from '../explorer/candidate-classifier.js';

import { calculateRecommendation } from './recommendation.js';
import type {
  PositionCard,
  CandidateMove,
  ClassicalFeatures,
  ShallowPositionCard,
  Motif,
  OpeningInfo,
  ReferenceGame,
  CardTier,
} from './types.js';
import { CARD_TIER_CONFIGS, SHALLOW_DEPTH_OFFSET } from './types.js';

/**
 * Normalize evaluation to White's perspective
 * Stockfish reports eval relative to side to move, but LLMs expect White's view
 *
 * @param evalCp - Evaluation in centipawns (relative to side to move)
 * @param sideToMove - Which side is to move ('white' or 'black')
 * @returns Evaluation from White's perspective (positive = White advantage)
 */
export function normalizeToWhitePerspective(evalCp: number, sideToMove: 'white' | 'black'): number {
  // If it's White's turn, the eval is already from White's perspective
  // If it's Black's turn, we need to negate the eval
  return sideToMove === 'white' ? evalCp : -evalCp;
}

/**
 * Maia probability thresholds for candidate selection
 */
const MAIA_THRESHOLD_FIRST_THREE = 0.05; // 5% for first 3 moves
const MAIA_THRESHOLD_ADDITIONAL = 0.1; // 10% for additional moves

/**
 * Filter Maia predictions to get candidate moves above threshold
 *
 * Selection rules:
 * - First 3 moves with >5% probability are always included
 * - Additional moves require >10% probability
 * - Sorted by probability descending
 *
 * @param predictions - Maia predictions sorted by probability descending
 * @returns Filtered predictions meeting threshold criteria
 */
export function filterMaiaCandidates(predictions: MaiaPrediction[]): MaiaPrediction[] {
  // Sort by probability descending (should already be sorted, but ensure)
  const sorted = [...predictions].sort((a, b) => b.probability - a.probability);

  const result: MaiaPrediction[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const pred = sorted[i]!;

    if (i < 3) {
      // First 3 slots: include if >5%
      if (pred.probability > MAIA_THRESHOLD_FIRST_THREE) {
        result.push(pred);
      }
    } else {
      // Additional slots: include only if >10%
      if (pred.probability > MAIA_THRESHOLD_ADDITIONAL) {
        result.push(pred);
      }
    }
  }

  return result;
}

/**
 * Maximum number of candidates in a merged set
 */
const MAX_MERGED_CANDIDATES = 6;

/**
 * Merged candidate before classification
 * Contains move SAN and optional data from engine/Maia
 */
interface MergedCandidate {
  san: string;
  engineCandidate?: EngineCandidate;
  maiaProbability?: number;
}

/**
 * Merge engine candidates with filtered Maia predictions into a unified set
 *
 * @param engineCandidates - Engine multipv candidates
 * @param maiaPredictions - Filtered Maia predictions (already threshold-filtered)
 * @returns Merged candidates (deduped by SAN)
 */
export function mergeCandidates(
  engineCandidates: EngineCandidate[],
  maiaPredictions: MaiaPrediction[],
): MergedCandidate[] {
  const candidateMap = new Map<string, MergedCandidate>();

  // Add engine candidates first (they have evaluations)
  for (const ec of engineCandidates) {
    candidateMap.set(ec.move, {
      san: ec.move,
      engineCandidate: ec,
    });
  }

  // Add Maia candidates (may overlap with engine candidates)
  for (const mp of maiaPredictions) {
    const existing = candidateMap.get(mp.san);
    if (existing) {
      // Update with Maia probability
      existing.maiaProbability = mp.probability;
    } else {
      // New Maia-only candidate
      candidateMap.set(mp.san, {
        san: mp.san,
        maiaProbability: mp.probability,
      });
    }
  }

  // Convert to array and limit
  return Array.from(candidateMap.values()).slice(0, MAX_MERGED_CANDIDATES);
}

/**
 * Services required by the builder
 */
export interface CardBuilderServices {
  stockfish: StockfishClient;
  sf16?: Stockfish16Client | undefined;
  maia?: MaiaClient | undefined;
  eco?: EcoClient | undefined;
  lichess?: LichessEliteClient | undefined;
  /** Optional shared evaluation cache for reducing Stockfish calls */
  evaluationCache?: EvaluationCache | undefined;
}

/**
 * Builder configuration
 */
export interface CardBuilderConfig {
  targetRating: number;
  engineDepth: number;
  multipv: number;
}

const DEFAULT_CONFIG: CardBuilderConfig = {
  targetRating: 1500,
  engineDepth: 18,
  multipv: 4,
};

/**
 * Position Card Builder
 */
export class PositionCardBuilder {
  private readonly config: CardBuilderConfig;

  constructor(
    private readonly services: CardBuilderServices,
    config?: Partial<CardBuilderConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build a Position Card for a FEN position
   *
   * @param fen - Position in FEN notation
   * @param treeDepth - Depth in the variation tree
   * @param tier - Card tier controlling analysis depth (default: 'full')
   */
  async build(fen: string, treeDepth: number, tier: CardTier = 'full'): Promise<PositionCard> {
    // Get tier-specific configuration
    const tierConfig = CARD_TIER_CONFIGS[tier];

    // Check for terminal position
    const pos = new ChessPosition(fen);
    const isCheckmate = pos.isCheckmate();
    const isStalemate = pos.isStalemate();
    const isTerminal = isCheckmate || isStalemate;

    if (isTerminal) {
      return this.buildTerminalCard(fen, treeDepth, isCheckmate ? 'checkmate' : 'stalemate');
    }

    // Run analyses in parallel, conditionally based on tier
    const [engineResult, sf16Result, maiaResult, openingResult, refGamesResult] = await Promise.all(
      [
        this.getEngineAnalysis(fen, tierConfig.engineDepth, tierConfig.multipv),
        tierConfig.includeClassicalFeatures
          ? this.getClassicalFeatures(fen)
          : Promise.resolve(undefined),
        tierConfig.includeMaia ? this.getMaiaPredictions(fen) : Promise.resolve(undefined),
        this.getOpeningInfo(),
        tierConfig.includeReferenceGames ? this.getReferenceGames(fen) : Promise.resolve(undefined),
      ],
    );

    // Determine side to move
    const sideToMove = fen.includes(' w ') ? 'white' : 'black';

    // Normalize evaluation to White's perspective
    const normalizedEval = normalizeToWhitePerspective(engineResult.evaluation, sideToMove);

    // Filter Maia predictions by threshold for candidate selection
    const filteredMaia = maiaResult ? filterMaiaCandidates(maiaResult) : [];

    // Classify candidates using engine candidates and filtered Maia predictions
    const candidates = this.classifyCandidates(engineResult.candidates, filteredMaia, sideToMove);

    // Build shallow cards for each candidate in parallel
    const shallowCardPromises = candidates.map((c) => this.buildShallowCard(fen, c.san, tier));
    const shallowCards = await Promise.all(shallowCardPromises);

    // Attach shallow cards to candidates (by matching index)
    for (let i = 0; i < candidates.length; i++) {
      const shallowCard = shallowCards[i];
      if (shallowCard) {
        candidates[i]!.shallowCard = shallowCard;
      }
    }

    // Detect motifs
    const motifs = this.detectMotifs(fen, engineResult.bestLine);

    // Calculate recommendation (uses normalized eval)
    const recommendation = calculateRecommendation({
      candidates,
      evaluation: {
        cp: normalizedEval,
        isMate: engineResult.isMate,
      },
      treeDepth,
      isTerminal: false,
    });

    const card: PositionCard = {
      fen,
      sideToMove,
      candidates,
      evaluation: {
        cp: normalizedEval,
        winProbability: this.cpToWinProbability(normalizedEval, sideToMove),
        isMate: engineResult.isMate,
        depth: engineResult.depth,
      },
      motifs,
      recommendation,
      treeDepth,
      isTerminal: false,
    };

    // Add optional mateIn only if defined
    if (engineResult.mateIn !== undefined) {
      card.evaluation.mateIn = engineResult.mateIn;
    }

    // Add optional Maia prediction
    if (maiaResult && maiaResult.length > 0 && maiaResult[0]) {
      card.maiaPrediction = {
        topMove: maiaResult[0].san,
        probability: maiaResult[0].probability,
        rating: this.config.targetRating,
      };
    }

    // Add optional fields
    if (sf16Result) {
      card.classicalFeatures = sf16Result;
    }
    if (openingResult) {
      card.opening = openingResult;
    }
    if (refGamesResult) {
      card.referenceGames = refGamesResult;
    }

    return card;
  }

  /**
   * Build a card for a terminal position
   */
  private buildTerminalCard(
    fen: string,
    treeDepth: number,
    terminalReason: 'checkmate' | 'stalemate',
  ): PositionCard {
    const sideToMove = fen.includes(' w ') ? 'white' : 'black';

    const card: PositionCard = {
      fen,
      sideToMove,
      candidates: [],
      evaluation: {
        cp: terminalReason === 'checkmate' ? (sideToMove === 'white' ? -10000 : 10000) : 0,
        winProbability: terminalReason === 'checkmate' ? (sideToMove === 'white' ? 0 : 100) : 50,
        isMate: terminalReason === 'checkmate',
        depth: 0,
      },
      motifs: [],
      recommendation: { action: 'SKIP', reason: terminalReason },
      treeDepth,
      isTerminal: true,
      terminalReason,
    };

    // Add mateIn only for checkmate
    if (terminalReason === 'checkmate') {
      card.evaluation.mateIn = 0;
    }

    return card;
  }

  /**
   * Get engine analysis (evaluation + candidates)
   *
   * @param fen - Position in FEN notation
   * @param depth - Optional depth override (for tiered cards)
   * @param multipv - Optional multipv override (for tiered cards)
   */
  private async getEngineAnalysis(
    fen: string,
    depth?: number,
    multipv?: number,
  ): Promise<{
    evaluation: number;
    isMate: boolean;
    mateIn?: number;
    depth: number;
    bestLine: string[];
    candidates: EngineCandidate[];
  }> {
    const effectiveDepth = depth ?? this.config.engineDepth;
    const effectiveMultipv = multipv ?? this.config.multipv;
    const cache = this.services.evaluationCache;

    // Check cache first
    if (cache) {
      const cached = cache.get(fen, effectiveDepth, effectiveMultipv);
      if (cached) {
        return this.transformCachedEvaluation(cached);
      }
    }

    try {
      const result = await this.services.stockfish.evaluate(fen, {
        depth: effectiveDepth,
        multipv: effectiveMultipv,
      });

      // Store in cache
      if (cache) {
        const cacheEntry: CachedEvaluation = {
          cp: result.cp,
          mate: result.mate,
          depth: result.depth,
          bestLine: result.bestLine || [],
          multipv: effectiveMultipv,
          timestamp: Date.now(),
        };

        if (result.alternatives && result.alternatives.length > 0) {
          cacheEntry.alternatives = result.alternatives.map((alt) => ({
            cp: alt.cp,
            mate: alt.mate,
            bestLine: alt.bestLine || [],
          }));
        }

        cache.set(fen, cacheEntry);
      }

      const candidates: EngineCandidate[] = [];

      // Process main line
      if (result.bestLine && result.bestLine.length > 0) {
        const mainCandidate: EngineCandidate = {
          move: result.bestLine[0]!,
          evaluation: result.mate !== 0 ? (result.mate > 0 ? 10000 : -10000) : result.cp,
          isMate: result.mate !== 0,
          pv: result.bestLine,
        };
        if (result.mate !== 0) {
          mainCandidate.mateIn = Math.abs(result.mate);
        }
        candidates.push(mainCandidate);
      }

      // Process alternatives (multipv)
      if (result.alternatives && result.alternatives.length > 0) {
        for (const alt of result.alternatives) {
          if (alt.bestLine && alt.bestLine.length > 0) {
            const altCandidate: EngineCandidate = {
              move: alt.bestLine[0]!,
              evaluation: alt.mate !== 0 ? (alt.mate > 0 ? 10000 : -10000) : alt.cp,
              isMate: alt.mate !== 0,
              pv: alt.bestLine,
            };
            if (alt.mate !== 0) {
              altCandidate.mateIn = Math.abs(alt.mate);
            }
            candidates.push(altCandidate);
          }
        }
      }

      const analysisResult: {
        evaluation: number;
        isMate: boolean;
        mateIn?: number;
        depth: number;
        bestLine: string[];
        candidates: EngineCandidate[];
      } = {
        evaluation: result.mate !== 0 ? (result.mate > 0 ? 10000 : -10000) : result.cp,
        isMate: result.mate !== 0,
        depth: result.depth,
        bestLine: result.bestLine || [],
        candidates,
      };

      if (result.mate !== 0) {
        analysisResult.mateIn = Math.abs(result.mate);
      }

      return analysisResult;
    } catch {
      // Return empty result on error
      return {
        evaluation: 0,
        isMate: false,
        depth: 0,
        bestLine: [],
        candidates: [],
      };
    }
  }

  /**
   * Transform cached evaluation to engine analysis result
   */
  private transformCachedEvaluation(cached: CachedEvaluation): {
    evaluation: number;
    isMate: boolean;
    mateIn?: number;
    depth: number;
    bestLine: string[];
    candidates: EngineCandidate[];
  } {
    const candidates: EngineCandidate[] = [];

    // Process main line
    if (cached.bestLine && cached.bestLine.length > 0) {
      const mainCandidate: EngineCandidate = {
        move: cached.bestLine[0]!,
        evaluation: cached.mate !== 0 ? (cached.mate > 0 ? 10000 : -10000) : cached.cp,
        isMate: cached.mate !== 0,
        pv: cached.bestLine,
      };
      if (cached.mate !== 0) {
        mainCandidate.mateIn = Math.abs(cached.mate);
      }
      candidates.push(mainCandidate);
    }

    // Process alternatives
    if (cached.alternatives && cached.alternatives.length > 0) {
      for (const alt of cached.alternatives) {
        if (alt.bestLine && alt.bestLine.length > 0) {
          const altCandidate: EngineCandidate = {
            move: alt.bestLine[0]!,
            evaluation: alt.mate !== 0 ? (alt.mate > 0 ? 10000 : -10000) : alt.cp,
            isMate: alt.mate !== 0,
            pv: alt.bestLine,
          };
          if (alt.mate !== 0) {
            altCandidate.mateIn = Math.abs(alt.mate);
          }
          candidates.push(altCandidate);
        }
      }
    }

    const result: {
      evaluation: number;
      isMate: boolean;
      mateIn?: number;
      depth: number;
      bestLine: string[];
      candidates: EngineCandidate[];
    } = {
      evaluation: cached.mate !== 0 ? (cached.mate > 0 ? 10000 : -10000) : cached.cp,
      isMate: cached.mate !== 0,
      depth: cached.depth,
      bestLine: cached.bestLine || [],
      candidates,
    };

    if (cached.mate !== 0) {
      result.mateIn = Math.abs(cached.mate);
    }

    return result;
  }

  /**
   * Get classical evaluation features from SF16
   */
  private async getClassicalFeatures(fen: string): Promise<ClassicalFeatures | undefined> {
    if (!this.services.sf16) {
      return undefined;
    }

    try {
      const result: ClassicalEvalResponse = await this.services.sf16.getClassicalEval(fen);

      return {
        material: { mg: result.material.total.mg, eg: result.material.total.eg },
        mobility: { mg: result.mobility.total.mg, eg: result.mobility.total.eg },
        kingSafety: { mg: result.kingSafety.total.mg, eg: result.kingSafety.total.eg },
        pawns: { mg: result.pawns.total.mg, eg: result.pawns.total.eg },
        space: { mg: result.space.total.mg, eg: result.space.total.eg },
        threats: { mg: result.threats.total.mg, eg: result.threats.total.eg },
        passed: { mg: result.passed.total.mg, eg: result.passed.total.eg },
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Get Maia predictions
   */
  private async getMaiaPredictions(fen: string): Promise<MaiaPrediction[] | undefined> {
    if (!this.services.maia) {
      return undefined;
    }

    try {
      const result = await this.services.maia.predict(fen, this.config.targetRating);

      return result.predictions.map((p) => ({
        san: p.move,
        probability: p.probability,
      }));
    } catch {
      return undefined;
    }
  }

  /**
   * Build a shallow position card for a candidate move
   *
   * @param fen - Current position FEN (before the move)
   * @param moveSan - Move in SAN format
   * @param tier - Card tier (determines shallow depth)
   * @returns ShallowPositionCard with eval and classical features, or undefined on error
   */
  async buildShallowCard(
    fen: string,
    moveSan: string,
    tier: CardTier,
  ): Promise<ShallowPositionCard | undefined> {
    try {
      // Apply the move to get the resulting position
      const pos = new ChessPosition(fen);
      const moveResult = pos.move(moveSan);
      const resultingFen = moveResult.fenAfter;

      // Calculate shallow depth from tier
      const tierConfig = CARD_TIER_CONFIGS[tier];
      const shallowDepth = Math.max(6, tierConfig.engineDepth - SHALLOW_DEPTH_OFFSET);

      // Determine side to move after the candidate move
      const sideToMove = resultingFen.includes(' w ') ? 'white' : 'black';

      // Get shallow evaluation and classical features in parallel
      const [evalResult, classicalFeatures] = await Promise.all([
        this.getEngineAnalysis(resultingFen, shallowDepth, 1),
        this.getClassicalFeatures(resultingFen),
      ]);

      // Classical features are required for shallow cards
      if (!classicalFeatures) {
        return undefined;
      }

      // Normalize evaluation to White's perspective
      const normalizedEval = normalizeToWhitePerspective(evalResult.evaluation, sideToMove);

      const shallowCard: ShallowPositionCard = {
        evalCp: normalizedEval,
        isMate: evalResult.isMate,
        depth: evalResult.depth,
        classicalFeatures,
      };

      if (evalResult.mateIn !== undefined) {
        shallowCard.mateIn = evalResult.mateIn;
      }

      return shallowCard;
    } catch {
      return undefined;
    }
  }

  /**
   * Get opening info
   * Note: EcoClient.getOpeningByMoves requires move history, not FEN.
   * Since we only have FEN here, we return undefined.
   * To get opening info, pass move history when building the card.
   */
  private async getOpeningInfo(): Promise<OpeningInfo | undefined> {
    // Opening lookup requires move history, which we don't have from just FEN
    // This would need to be enhanced to accept move history as a parameter
    return undefined;
  }

  /**
   * Get reference games
   */
  private async getReferenceGames(fen: string): Promise<ReferenceGame[] | undefined> {
    if (!this.services.lichess) {
      return undefined;
    }

    try {
      const result = this.services.lichess.getReferenceGames(fen, 3);
      if (!result.games || result.games.length === 0) {
        return undefined;
      }

      return result.games.map((g) => {
        const game: ReferenceGame = {
          white: g.white,
          black: g.black,
          result: g.result,
        };

        if (g.date) {
          const yearStr = g.date.split('.')[0];
          if (yearStr) {
            game.year = parseInt(yearStr, 10);
          }
        }
        if (g.event) {
          game.event = g.event;
        }

        return game;
      });
    } catch {
      return undefined;
    }
  }

  /**
   * Classify candidates with sources
   * Normalizes evaluations to White's perspective
   */
  private classifyCandidates(
    engineCandidates: EngineCandidate[],
    maiaPredictions: MaiaPrediction[] | undefined,
    sideToMove: 'white' | 'black',
  ): CandidateMove[] {
    if (engineCandidates.length === 0) {
      return [];
    }

    const config = getDefaultConfig(this.config.targetRating);
    const classified = classifyCandidates(engineCandidates, maiaPredictions, config);

    return classified.map((c) => {
      // Normalize evaluation to White's perspective
      const normalizedEval = normalizeToWhitePerspective(c.evaluation, sideToMove);

      const move: CandidateMove = {
        san: c.move,
        source: c.primarySource,
        evalCp: normalizedEval,
        isMate: c.isMate,
        pv: c.line.split(' '),
      };

      // Add optional properties only if they have values
      if (c.sources && c.sources.length > 1) {
        move.secondarySources = c.sources.filter((s) => s !== c.primarySource);
      }
      if (c.mateIn !== undefined) {
        move.mateIn = c.mateIn;
      }
      if (c.humanProbability !== undefined) {
        move.maiaProbability = c.humanProbability;
      }

      return move;
    });
  }

  /**
   * Detect tactical and strategic motifs (deterministic)
   */
  private detectMotifs(fen: string, bestLine: string[]): Motif[] {
    const motifs: Motif[] = [];
    const pos = new ChessPosition(fen);

    // Check for checks
    if (pos.isCheck()) {
      motifs.push('discovered_attack');
    }

    // Detect back rank weakness (simplified)
    // In real implementation, this would analyze king safety squares
    const fenParts = fen.split(' ');
    const board = fenParts[0]!;

    // White back rank weakness (king on 1st rank with pawns blocking)
    if (board.endsWith('K') || board.includes('K1/')) {
      const rank1 = board.split('/').pop()!;
      if (rank1.includes('PP') || rank1.includes('PPP')) {
        motifs.push('back_rank_weakness');
      }
    }

    // Black back rank weakness
    if (board.startsWith('k') || board.includes('/k')) {
      const rank8 = board.split('/')[0]!;
      if (rank8.includes('pp') || rank8.includes('ppp')) {
        motifs.push('back_rank_weakness');
      }
    }

    // Detect passed pawns (simplified)
    // This is a placeholder - real implementation would check pawn structure
    if (board.match(/P[1-7]\/[1-8]\/[1-8]\/[1-8]\/[1-8]\/[1-8]/)) {
      motifs.push('passed_pawn');
    }

    // If best line has captures on consecutive moves, likely a tactical sequence
    if (bestLine.length >= 2) {
      const captureCount = bestLine.slice(0, 4).filter((m) => m.includes('x')).length;
      if (captureCount >= 2) {
        motifs.push('double_attack');
      }
    }

    return motifs;
  }

  /**
   * Convert centipawns to win probability for side to move
   *
   * @param cp - Evaluation in centipawns (from White's perspective)
   * @param sideToMove - Which side is to move
   * @returns Win probability (0-100) for the side to move
   */
  private cpToWinProbability(cp: number, sideToMove: 'white' | 'black'): number {
    // Sigmoid function approximation
    // At +100cp, roughly 60% win for White; at +300cp, roughly 85%
    const k = 0.004;
    const whiteWinProb = 1 / (1 + Math.exp(-k * cp));
    const whitePercentage = Math.round(whiteWinProb * 100);

    // Return probability for side to move
    // If Black to move, invert (Black's win prob = 100 - White's win prob)
    return sideToMove === 'white' ? whitePercentage : 100 - whitePercentage;
  }
}
