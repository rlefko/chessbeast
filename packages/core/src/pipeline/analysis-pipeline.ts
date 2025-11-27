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
 * Options for engine evaluation
 */
export interface EvaluationOptions {
  /** Search depth limit */
  depth?: number;
  /** Time limit in milliseconds (engine stops at whichever limit is reached first) */
  timeLimitMs?: number;
  /** Number of principal variations to return */
  numLines?: number;
}

/**
 * Engine evaluation service interface
 * (Implemented by gRPC client)
 */
export interface EngineService {
  /** Evaluate a position (shallow) */
  evaluate(fen: string, depth: number): Promise<EngineEvaluation>;
  /** Evaluate a position with multiple variations */
  evaluateMultiPv(
    fen: string,
    depthOrOptions: number | EvaluationOptions,
    numLines?: number,
  ): Promise<EngineEvaluation[]>;
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
 * Opening lookup result
 */
export interface OpeningLookupResult {
  /** Opening info if found */
  opening?: {
    eco: string;
    name: string;
    numPlies: number;
  };
  /** Number of plies that matched the opening */
  matchedPlies: number;
  /** Ply where game left known theory */
  leftTheoryAtPly?: number;
  /** Whether game matches opening exactly */
  isExactMatch: boolean;
}

/**
 * Opening database service interface
 * (Implemented by database client)
 */
export interface OpeningService {
  /** Look up opening from move sequence (UCI format) */
  getOpeningByMoves(movesUci: string[]): OpeningLookupResult;
}

/**
 * Reference game result
 */
export interface ReferenceGameInfo {
  white: string;
  black: string;
  result: string;
  whiteElo?: number;
  blackElo?: number;
  eco?: string;
}

/**
 * Reference game database service interface
 * (Implemented by database client)
 */
export interface ReferenceGameService {
  /** Get reference games that reached a position */
  getReferenceGames(
    fen: string,
    limit?: number,
  ): { games: ReferenceGameInfo[]; totalCount: number };
}

/**
 * Analysis configuration
 */
export interface AnalysisConfig {
  /** Depth for shallow pass (default 14) */
  shallowDepth?: number;
  /** Time limit per position for shallow pass in ms (default 3000) */
  shallowTimeLimitMs?: number;
  /** Depth for deep pass (default 22) */
  deepDepth?: number;
  /** Time limit per position for deep pass in ms (default 10000) */
  deepTimeLimitMs?: number;
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
  shallowTimeLimitMs: 3000,
  deepDepth: 22,
  deepTimeLimitMs: 10000,
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
  private openings?: OpeningService;
  private config: Required<AnalysisConfig>;
  private onProgress?: ProgressCallback;

  constructor(
    engine: EngineService,
    maia?: MaiaService,
    openings?: OpeningService,
    referenceGames?: ReferenceGameService,
    config: AnalysisConfig = {},
    onProgress?: ProgressCallback,
  ) {
    this.engine = engine;
    if (maia !== undefined) {
      this.maia = maia;
    }
    if (openings !== undefined) {
      this.openings = openings;
    }
    // referenceGames is accepted for API compatibility but not yet used
    // Will be used in LLM annotation phase
    void referenceGames;
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

    // Opening lookup (if service available)
    let openingName: string | undefined;
    let openingEco: string | undefined;
    let openingEndPly: number | undefined;

    if (this.openings) {
      // Convert SAN moves to UCI for opening lookup
      // Note: The opening service expects UCI moves
      // For now, we'll pass the SAN moves and let the service handle conversion if needed
      const moveSans = moves.map((m) => m.san);
      const lookupResult = this.openings.getOpeningByMoves(moveSans);

      if (lookupResult.opening) {
        openingName = lookupResult.opening.name;
        openingEco = lookupResult.opening.eco;
      }
      if (lookupResult.leftTheoryAtPly !== undefined) {
        openingEndPly = lookupResult.leftTheoryAtPly;
      }
    }

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

    // Add opening end ply to stats if available from opening lookup
    if (openingEndPly !== undefined) {
      stats.openingEndPly = openingEndPly;
    }

    // Build final result metadata (only include defined properties)
    const resultMetadata: GameAnalysis['metadata'] = {
      white: metadata.white,
      black: metadata.black,
      result: metadata.result,
    };
    if (metadata.event !== undefined) resultMetadata.event = metadata.event;
    if (metadata.date !== undefined) resultMetadata.date = metadata.date;
    // Use ECO from opening lookup if available, otherwise from metadata
    if (openingEco !== undefined) {
      resultMetadata.eco = openingEco;
    } else if (metadata.eco !== undefined) {
      resultMetadata.eco = metadata.eco;
    }
    if (openingName !== undefined) resultMetadata.openingName = openingName;
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
      const evalResults = await this.engine.evaluateMultiPv(move.fenBefore, {
        depth: this.config.shallowDepth,
        timeLimitMs: this.config.shallowTimeLimitMs,
        numLines: 1,
      });
      const evalBefore = evalResults[0]!;
      const bestMove = evalBefore.pv[0] ?? move.san;

      // Evaluate position after move
      const evalAfterResults = await this.engine.evaluateMultiPv(move.fenAfter, {
        depth: this.config.shallowDepth,
        timeLimitMs: this.config.shallowTimeLimitMs,
        numLines: 1,
      });
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
        const multiPvResults = await this.engine.evaluateMultiPv(move.fenBefore, {
          depth: this.config.deepDepth,
          timeLimitMs: this.config.deepTimeLimitMs,
          numLines: this.config.multiPvCount,
        });

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
   * Also adds Maia's predicted move as an alternative for mistakes/blunders
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

        // For mistakes and blunders, add Maia's top predicted move as an alternative
        // This shows what a human at this rating would likely play
        if (
          (move.classification === 'mistake' || move.classification === 'blunder') &&
          predictions.length > 0
        ) {
          const maiaTopMove = predictions[0]!;

          // Only add if it's different from both the played move and engine best move
          if (maiaTopMove.san !== move.san && maiaTopMove.san !== move.bestMove) {
            // Check if this move isn't already in alternatives
            const existingAlt = move.alternatives?.find((alt) => alt.san === maiaTopMove.san);
            if (!existingAlt) {
              // Get engine evaluation for the Maia move to provide proper PV
              let maiaEval: EngineEvaluation;
              try {
                // Evaluate the position after the Maia move
                // We need to make the move first to get the resulting position
                // For simplicity, we'll get a shallow eval with the move as first PV
                const evalResults = await this.engine.evaluateMultiPv(move.fenBefore, {
                  depth: this.config.shallowDepth,
                  timeLimitMs: this.config.shallowTimeLimitMs,
                  numLines: 1,
                });
                maiaEval = evalResults[0] ?? {
                  depth: 0,
                  pv: [maiaTopMove.san],
                };
                // Replace first move in PV with Maia move if it's different
                if (maiaEval.pv[0] !== maiaTopMove.san) {
                  maiaEval = {
                    ...maiaEval,
                    pv: [maiaTopMove.san, ...maiaEval.pv.slice(1)],
                  };
                }
              } catch {
                maiaEval = {
                  depth: 0,
                  pv: [maiaTopMove.san],
                };
              }

              // Create a Maia alternative with a special tag
              const maiaAlternative: AlternativeMove = {
                san: maiaTopMove.san,
                eval: maiaEval,
                tag: 'strategic', // Maia moves tend to be more intuitive/strategic
              };

              // Initialize alternatives array if needed
              if (!move.alternatives) {
                move.alternatives = [];
              }

              // Add Maia alternative at the beginning to highlight it
              move.alternatives.unshift(maiaAlternative);
            }
          }
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
  openings?: OpeningService,
  referenceGames?: ReferenceGameService,
  config?: AnalysisConfig,
  onProgress?: ProgressCallback,
): AnalysisPipeline {
  return new AnalysisPipeline(engine, maia, openings, referenceGames, config, onProgress);
}
