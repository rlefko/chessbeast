/**
 * Analysis Pipeline
 *
 * Coordinates the full game analysis process:
 * 1. Parse game (input)
 * 2. Shallow analysis pass (all positions)
 * 3. Move classification
 * 4. Critical moment detection
 * 5. Deep analysis pass (critical moments only)
 * 6. Return analysis results
 */

import {
  detectCriticalMoments,
  detectPhaseTransitions,
  type PlyEvaluation,
} from '../classifier/critical-moment-detector.js';
import { classifyMove, calculateAccuracy } from '../classifier/move-classifier.js';
import { DEFAULT_RATING } from '../classifier/thresholds.js';
import type { MoveClassification } from '../index.js';
import type {
  AlternativeMove,
  CriticalMoment,
  EngineEvaluation,
  GameAnalysis,
  GameStats,
  MoveAnalysis,
  PlayerStats,
} from '../types/analysis.js';

/**
 * Input: A single move from a parsed game
 */
export interface ParsedMove {
  san: string;
  fenBefore: string;
  fenAfter: string;
  moveNumber: number;
  isWhiteMove: boolean;
}

/**
 * Input: Parsed game data
 */
export interface ParsedGameInput {
  metadata: {
    white: string;
    black: string;
    result: string;
    event?: string;
    date?: string;
    eco?: string;
    whiteElo?: number;
    blackElo?: number;
  };
  moves: ParsedMove[];
}

/**
 * Engine evaluation service interface
 * (Implemented by gRPC client)
 */
export interface EngineService {
  /** Evaluate a position (shallow) */
  evaluate(fen: string, depth: number): Promise<EngineEvaluation>;
  /** Evaluate a position with multiple variations */
  evaluateMultiPv(fen: string, depth: number, numLines: number): Promise<EngineEvaluation[]>;
}

/**
 * Maia prediction service interface
 * (Implemented by gRPC client)
 */
export interface MaiaService {
  /** Get probability of each move being played by a human at given rating */
  predictMoves(fen: string, rating: number): Promise<Array<{ san: string; probability: number }>>;
  /** Estimate player rating from moves */
  estimateRating(
    moves: Array<{ fen: string; san: string }>,
  ): Promise<{ rating: number; confidence: number }>;
}

/**
 * Analysis configuration
 */
export interface AnalysisConfig {
  /** Depth for shallow pass (default 14) */
  shallowDepth?: number;
  /** Depth for deep pass (default 22) */
  deepDepth?: number;
  /** Number of lines for deep analysis (default 3) */
  multiPvCount?: number;
  /** Player rating for white (overrides metadata) */
  whiteRating?: number;
  /** Player rating for black (overrides metadata) */
  blackRating?: number;
  /** Maximum critical moment ratio (default 0.25) */
  maxCriticalRatio?: number;
  /** Skip Maia analysis (for testing) */
  skipMaia?: boolean;
}

/**
 * Default analysis configuration
 */
const DEFAULT_CONFIG: Required<AnalysisConfig> = {
  shallowDepth: 14,
  deepDepth: 22,
  multiPvCount: 3,
  whiteRating: DEFAULT_RATING,
  blackRating: DEFAULT_RATING,
  maxCriticalRatio: 0.25,
  skipMaia: false,
};

/**
 * Analysis progress callback
 */
export type ProgressCallback = (phase: string, current: number, total: number) => void;

/**
 * Main analysis pipeline
 */
export class AnalysisPipeline {
  private engine: EngineService;
  private maia?: MaiaService;
  private config: Required<AnalysisConfig>;
  private onProgress?: ProgressCallback;

  constructor(
    engine: EngineService,
    maia?: MaiaService,
    config: AnalysisConfig = {},
    onProgress?: ProgressCallback,
  ) {
    this.engine = engine;
    if (maia !== undefined) {
      this.maia = maia;
    }
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (onProgress !== undefined) {
      this.onProgress = onProgress;
    }
  }

  /**
   * Run full analysis on a game
   */
  async analyze(game: ParsedGameInput): Promise<GameAnalysis> {
    const { moves, metadata } = game;

    // Determine player ratings
    const whiteRating = this.config.whiteRating ?? metadata.whiteElo ?? DEFAULT_RATING;
    const blackRating = this.config.blackRating ?? metadata.blackElo ?? DEFAULT_RATING;

    // Store estimated ratings if we need to compute them
    let estimatedWhiteElo: number | undefined;
    let estimatedBlackElo: number | undefined;

    // Phase 1: Shallow analysis pass
    this.reportProgress('shallow_analysis', 0, moves.length);
    const shallowResults = await this.shallowPass(moves);

    // Phase 2: Move classification
    this.reportProgress('classification', 0, moves.length);
    const classifiedMoves = this.classifyMoves(shallowResults, whiteRating, blackRating);

    // Phase 3: Critical moment detection
    this.reportProgress('critical_detection', 0, 1);
    const plyEvaluations: PlyEvaluation[] = classifiedMoves.map((m, i) => ({
      plyIndex: i,
      moveNumber: m.moveNumber,
      isWhiteMove: m.isWhiteMove,
      evalBefore: m.evalBefore,
      evalAfter: m.evalAfter,
      classification: m.classification,
      cpLoss: m.cpLoss,
    }));

    const criticalMoments = detectCriticalMoments(plyEvaluations, {
      maxCriticalRatio: this.config.maxCriticalRatio,
    });

    // Mark critical moments in move analysis
    const criticalPlySet = new Set(criticalMoments.map((c) => c.plyIndex));
    for (const move of classifiedMoves) {
      move.isCriticalMoment = criticalPlySet.has(move.plyIndex);
    }

    // Phase 4: Deep analysis for critical moments
    this.reportProgress('deep_analysis', 0, criticalMoments.length);
    await this.deepPass(classifiedMoves, criticalMoments);

    // Phase 5: Maia analysis (if available)
    if (this.maia && !this.config.skipMaia) {
      this.reportProgress('maia_analysis', 0, moves.length);
      await this.maiaPass(classifiedMoves, whiteRating, blackRating);

      // Optionally estimate ratings if not provided
      if (!metadata.whiteElo || !metadata.blackElo) {
        const whiteMoves = classifiedMoves.filter((m) => m.isWhiteMove);
        const blackMoves = classifiedMoves.filter((m) => !m.isWhiteMove);

        if (whiteMoves.length > 0 && !metadata.whiteElo) {
          const estimate = await this.maia.estimateRating(
            whiteMoves.map((m) => ({ fen: m.fenBefore, san: m.san })),
          );
          estimatedWhiteElo = estimate.rating;
        }

        if (blackMoves.length > 0 && !metadata.blackElo) {
          const estimate = await this.maia.estimateRating(
            blackMoves.map((m) => ({ fen: m.fenBefore, san: m.san })),
          );
          estimatedBlackElo = estimate.rating;
        }
      }
    }

    // Phase 6: Calculate statistics
    const stats = this.calculateStats(classifiedMoves);

    // Build final result metadata (only include defined properties)
    const resultMetadata: GameAnalysis['metadata'] = {
      white: metadata.white,
      black: metadata.black,
      result: metadata.result,
    };
    if (metadata.event !== undefined) resultMetadata.event = metadata.event;
    if (metadata.date !== undefined) resultMetadata.date = metadata.date;
    if (metadata.eco !== undefined) resultMetadata.eco = metadata.eco;
    if (metadata.whiteElo !== undefined) resultMetadata.whiteElo = metadata.whiteElo;
    if (metadata.blackElo !== undefined) resultMetadata.blackElo = metadata.blackElo;
    if (estimatedWhiteElo !== undefined) resultMetadata.estimatedWhiteElo = estimatedWhiteElo;
    if (estimatedBlackElo !== undefined) resultMetadata.estimatedBlackElo = estimatedBlackElo;

    const result: GameAnalysis = {
      metadata: resultMetadata,
      moves: classifiedMoves,
      criticalMoments,
      stats,
    };

    this.reportProgress('complete', 1, 1);
    return result;
  }

  /**
   * Shallow analysis pass - evaluate all positions
   */
  private async shallowPass(moves: ParsedMove[]): Promise<
    Array<{
      move: ParsedMove;
      evalBefore: EngineEvaluation;
      evalAfter: EngineEvaluation;
      bestMove: string;
    }>
  > {
    const results: Array<{
      move: ParsedMove;
      evalBefore: EngineEvaluation;
      evalAfter: EngineEvaluation;
      bestMove: string;
    }> = [];

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i]!;
      this.reportProgress('shallow_analysis', i, moves.length);

      // Evaluate position before move
      const evalResults = await this.engine.evaluateMultiPv(
        move.fenBefore,
        this.config.shallowDepth,
        1,
      );
      const evalBefore = evalResults[0]!;
      const bestMove = evalBefore.pv[0] ?? move.san;

      // Evaluate position after move
      const evalAfterResults = await this.engine.evaluateMultiPv(
        move.fenAfter,
        this.config.shallowDepth,
        1,
      );
      const evalAfter = evalAfterResults[0]!;

      results.push({ move, evalBefore, evalAfter, bestMove });
    }

    return results;
  }

  /**
   * Classify all moves based on evaluations
   */
  private classifyMoves(
    shallowResults: Array<{
      move: ParsedMove;
      evalBefore: EngineEvaluation;
      evalAfter: EngineEvaluation;
      bestMove: string;
    }>,
    whiteRating: number,
    blackRating: number,
  ): MoveAnalysis[] {
    return shallowResults.map(({ move, evalBefore, evalAfter, bestMove }, i) => {
      this.reportProgress('classification', i, shallowResults.length);

      const rating = move.isWhiteMove ? whiteRating : blackRating;
      const result = classifyMove(evalBefore, evalAfter, move.isWhiteMove, { rating });

      return {
        plyIndex: i,
        moveNumber: move.moveNumber,
        isWhiteMove: move.isWhiteMove,
        san: move.san,
        fenBefore: move.fenBefore,
        fenAfter: move.fenAfter,
        evalBefore,
        evalAfter,
        bestMove,
        cpLoss: result.cpLoss,
        classification: result.classification,
        isCriticalMoment: false, // Will be set later
      };
    });
  }

  /**
   * Deep analysis pass - analyze critical moments with multi-PV
   */
  private async deepPass(moves: MoveAnalysis[], criticalMoments: CriticalMoment[]): Promise<void> {
    const criticalIndices = new Set(criticalMoments.map((c) => c.plyIndex));

    let processed = 0;
    for (const move of moves) {
      if (criticalIndices.has(move.plyIndex)) {
        this.reportProgress('deep_analysis', processed, criticalMoments.length);

        // Get multiple principal variations
        const multiPvResults = await this.engine.evaluateMultiPv(
          move.fenBefore,
          this.config.deepDepth,
          this.config.multiPvCount,
        );

        // First PV updates the evaluation
        if (multiPvResults[0]) {
          move.evalBefore = multiPvResults[0];
          move.bestMove = multiPvResults[0].pv[0] ?? move.san;
        }

        // Additional PVs become alternatives
        move.alternatives = multiPvResults.slice(1).map(
          (pv): AlternativeMove => ({
            san: pv.pv[0] ?? '',
            eval: pv,
          }),
        );

        processed++;
      }
    }
  }

  /**
   * Maia analysis pass - get human probability for each move
   */
  private async maiaPass(
    moves: MoveAnalysis[],
    whiteRating: number,
    blackRating: number,
  ): Promise<void> {
    if (!this.maia) return;

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i]!;
      this.reportProgress('maia_analysis', i, moves.length);

      const rating = move.isWhiteMove ? whiteRating : blackRating;

      try {
        const predictions = await this.maia.predictMoves(move.fenBefore, rating);
        const playedMove = predictions.find((p) => p.san === move.san);
        if (playedMove) {
          move.humanProbability = playedMove.probability;
        }
      } catch {
        // Maia prediction failed, continue without it
      }
    }
  }

  /**
   * Calculate game statistics
   */
  private calculateStats(moves: MoveAnalysis[]): GameStats {
    const whiteMoves = moves.filter((m) => m.isWhiteMove);
    const blackMoves = moves.filter((m) => !m.isWhiteMove);

    const countClassification = (
      moveList: MoveAnalysis[],
      classification: MoveClassification,
    ): number => moveList.filter((m) => m.classification === classification).length;

    const calculatePlayerStats = (moveList: MoveAnalysis[]): PlayerStats => {
      const cpLosses = moveList.map((m) => m.cpLoss);
      const averageCpLoss =
        cpLosses.length > 0 ? cpLosses.reduce((a, b) => a + b, 0) / cpLosses.length : 0;

      return {
        averageCpLoss: Math.round(averageCpLoss * 10) / 10,
        inaccuracies: countClassification(moveList, 'inaccuracy'),
        mistakes: countClassification(moveList, 'mistake'),
        blunders: countClassification(moveList, 'blunder'),
        excellentMoves: countClassification(moveList, 'excellent'),
        brilliantMoves: countClassification(moveList, 'brilliant'),
        accuracy: calculateAccuracy(cpLosses),
      };
    };

    const phaseTransitions = detectPhaseTransitions(
      moves.map((m, i) => ({
        plyIndex: i,
        moveNumber: m.moveNumber,
        isWhiteMove: m.isWhiteMove,
        evalBefore: m.evalBefore,
        evalAfter: m.evalAfter,
        classification: m.classification,
        cpLoss: m.cpLoss,
      })),
    );

    return {
      totalMoves: Math.ceil(moves.length / 2),
      totalPlies: moves.length,
      white: calculatePlayerStats(whiteMoves),
      black: calculatePlayerStats(blackMoves),
      phaseTransitions: phaseTransitions.map((t) => ({
        toPly: t.plyIndex,
        phase: t.phase,
      })),
    };
  }

  /**
   * Report progress to callback
   */
  private reportProgress(phase: string, current: number, total: number): void {
    if (this.onProgress) {
      this.onProgress(phase, current, total);
    }
  }
}

/**
 * Create an analysis pipeline with the given services
 */
export function createAnalysisPipeline(
  engine: EngineService,
  maia?: MaiaService,
  config?: AnalysisConfig,
  onProgress?: ProgressCallback,
): AnalysisPipeline {
  return new AnalysisPipeline(engine, maia, config, onProgress);
}
