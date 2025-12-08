/**
 * Staged Analysis Pipeline
 *
 * A wrapper around AnalysisPipeline that adds:
 * - Position key generation for caching
 * - Multi-tier staged analysis (shallow → standard → full)
 * - Criticality-based tier promotion
 * - Artifact caching integration
 * - Progress tracking per stage
 *
 * This enables efficient analysis by:
 * - Analyzing all positions at shallow depth first
 * - Promoting critical positions to deeper analysis
 * - Reusing cached results for transpositions
 */

import { recommendMultipv } from '../classifier/adaptive-multipv.js';
import {
  calculateCriticality,
  type CriticalityScore,
  TIER_PROMOTION_THRESHOLDS,
} from '../classifier/criticality-scorer.js';
import type { AnalysisTier } from '../storage/artifacts/base.js';
import { getTierConfig } from '../storage/artifacts/base.js';
import {
  createEngineEvalArtifact,
  type EngineEvalArtifact,
  type PVLine,
} from '../storage/artifacts/engine-eval.js';
import type { ArtifactCache } from '../storage/cache/artifact-cache.js';
import { generatePositionKey, type PositionKey } from '../storage/position-key.js';
import type { EngineEvaluation, GameAnalysis, MoveAnalysis } from '../types/analysis.js';

import type {
  EngineService,
  MaiaService,
  OpeningService,
  ParsedGameInput,
  ProgressCallback,
  EvaluationOptions,
} from './analysis-pipeline.js';

/**
 * Configuration for staged pipeline
 */
export interface StagedPipelineConfig {
  /** Artifact cache for storing/retrieving analysis results */
  cache?: ArtifactCache;

  /** Criticality thresholds for tier promotion */
  tierThresholds?: {
    /** Minimum score for standard tier (default: 40) */
    standardPromotion: number;
    /** Minimum score for full tier (default: 70) */
    fullPromotion: number;
  };

  /** Maximum ratio of positions to analyze at higher tiers (default: 0.25) */
  maxCriticalRatio?: number;

  /** Player ratings for threshold adjustment */
  whiteRating?: number;
  blackRating?: number;

  /** Engine version string for artifact keys */
  engineVersion?: string;

  /** Skip Maia analysis */
  skipMaia?: boolean;

  /** Progress callback */
  onProgress?: ProgressCallback;
}

/**
 * Result from a single stage of analysis
 */
export interface StageResult {
  /** Stage number (0-indexed) */
  stage: number;

  /** Stage name for display */
  stageName: string;

  /** Analysis tier used */
  tier: AnalysisTier;

  /** Number of positions analyzed in this stage */
  positionsAnalyzed: number;

  /** Number of cache hits */
  cacheHits: number;

  /** Number of cache misses (new analyses) */
  cacheMisses: number;

  /** Time taken in milliseconds */
  timeMs: number;
}

/**
 * Complete staged analysis result
 */
export interface StagedAnalysisResult {
  /** Game analysis result */
  analysis: GameAnalysis;

  /** Results from each stage */
  stageResults: StageResult[];

  /** Total time taken */
  totalTimeMs: number;

  /** Cache statistics */
  cacheStats: {
    totalHits: number;
    totalMisses: number;
    hitRate: number;
  };

  /** Criticality scores per move */
  criticalityScores: CriticalityScore[];
}

/**
 * Position with analysis state
 */
interface PositionState {
  fen: string;
  positionKey: PositionKey;
  plyIndex: number;
  isWhiteMove: boolean;
  currentTier: AnalysisTier;
  criticalityScore?: CriticalityScore;
  evalBefore?: EngineEvaluation;
  evalAfter?: EngineEvaluation;
}

/**
 * Default staged pipeline configuration
 */
const DEFAULT_STAGED_CONFIG: Required<Omit<StagedPipelineConfig, 'cache' | 'onProgress'>> = {
  tierThresholds: {
    standardPromotion: TIER_PROMOTION_THRESHOLDS.standard,
    fullPromotion: TIER_PROMOTION_THRESHOLDS.full,
  },
  maxCriticalRatio: 0.25,
  whiteRating: 1500,
  blackRating: 1500,
  engineVersion: 'stockfish-17',
  skipMaia: false,
};

/**
 * Staged analysis pipeline
 *
 * Provides multi-tier analysis with caching and criticality-based promotion.
 */
export class StagedAnalysisPipeline {
  private readonly engine: EngineService;
  private readonly cache?: ArtifactCache;
  private readonly config: Required<Omit<StagedPipelineConfig, 'cache' | 'onProgress'>>;
  private onProgress?: ProgressCallback;

  constructor(
    engine: EngineService,
    _maia?: MaiaService,
    _openings?: OpeningService,
    config: StagedPipelineConfig = {},
  ) {
    this.engine = engine;
    // _maia and _openings reserved for future integration
    if (config.cache !== undefined) {
      this.cache = config.cache;
    }
    this.config = {
      ...DEFAULT_STAGED_CONFIG,
      ...config,
      tierThresholds: {
        ...DEFAULT_STAGED_CONFIG.tierThresholds,
        ...config.tierThresholds,
      },
    };
    if (config.onProgress !== undefined) {
      this.onProgress = config.onProgress;
    }
  }

  /**
   * Run staged analysis on a game
   */
  async analyze(game: ParsedGameInput): Promise<StagedAnalysisResult> {
    const startTime = Date.now();
    const stageResults: StageResult[] = [];
    const criticalityScores: CriticalityScore[] = [];

    let totalCacheHits = 0;
    let totalCacheMisses = 0;

    // Initialize position states
    const positions = this.initializePositions(game);

    // Stage 0: Position key generation (already done in initializePositions)
    stageResults.push({
      stage: 0,
      stageName: 'Position Key Generation',
      tier: 'shallow',
      positionsAnalyzed: positions.length,
      cacheHits: 0,
      cacheMisses: 0,
      timeMs: 0,
    });

    // Stage 1: Shallow pass (all positions)
    const shallowResult = await this.runTierPass(positions, 'shallow', 'Shallow Analysis');
    stageResults.push(shallowResult);
    totalCacheHits += shallowResult.cacheHits;
    totalCacheMisses += shallowResult.cacheMisses;

    // Stage 2: Compute criticality scores
    const scoreStartTime = Date.now();
    for (const pos of positions) {
      if (pos.evalBefore && pos.evalAfter) {
        const score = calculateCriticality(pos.evalBefore.cp ?? 0, pos.evalAfter.cp ?? 0, {
          playerRating: pos.isWhiteMove ? this.config.whiteRating : this.config.blackRating,
        });
        pos.criticalityScore = score;
        criticalityScores.push(score);
      }
    }
    stageResults.push({
      stage: 2,
      stageName: 'Criticality Scoring',
      tier: 'shallow',
      positionsAnalyzed: positions.length,
      cacheHits: 0,
      cacheMisses: 0,
      timeMs: Date.now() - scoreStartTime,
    });

    // Stage 3: Standard tier promotion
    const standardPositions = this.selectForPromotion(
      positions,
      'standard',
      this.config.tierThresholds.standardPromotion,
    );
    if (standardPositions.length > 0) {
      const standardResult = await this.runTierPass(
        standardPositions,
        'standard',
        'Standard Analysis',
      );
      stageResults.push(standardResult);
      totalCacheHits += standardResult.cacheHits;
      totalCacheMisses += standardResult.cacheMisses;
    }

    // Stage 4: Full tier promotion
    const fullPositions = this.selectForPromotion(
      positions,
      'full',
      this.config.tierThresholds.fullPromotion,
    );
    if (fullPositions.length > 0) {
      const fullResult = await this.runTierPass(fullPositions, 'full', 'Full Analysis');
      stageResults.push(fullResult);
      totalCacheHits += fullResult.cacheHits;
      totalCacheMisses += fullResult.cacheMisses;
    }

    // Build final analysis result
    const analysis = this.buildGameAnalysis(game, positions);

    const totalTime = Date.now() - startTime;
    const totalRequests = totalCacheHits + totalCacheMisses;

    return {
      analysis,
      stageResults,
      totalTimeMs: totalTime,
      cacheStats: {
        totalHits: totalCacheHits,
        totalMisses: totalCacheMisses,
        hitRate: totalRequests > 0 ? totalCacheHits / totalRequests : 0,
      },
      criticalityScores,
    };
  }

  /**
   * Initialize position states from parsed game
   */
  private initializePositions(game: ParsedGameInput): PositionState[] {
    return game.moves.map((move, index) => ({
      fen: move.fenBefore,
      positionKey: generatePositionKey(move.fenBefore),
      plyIndex: index,
      isWhiteMove: move.isWhiteMove,
      currentTier: 'shallow' as AnalysisTier,
    }));
  }

  /**
   * Run analysis pass for a specific tier
   */
  private async runTierPass(
    positions: PositionState[],
    tier: AnalysisTier,
    stageName: string,
  ): Promise<StageResult> {
    const startTime = Date.now();
    const tierConfig = getTierConfig(tier);
    let cacheHits = 0;
    let cacheMisses = 0;

    this.reportProgress(stageName, 0, positions.length);

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i]!;

      // Check cache first
      const cached = this.getCachedEval(pos.positionKey.key, tier);
      if (cached) {
        pos.evalBefore = this.artifactToEval(cached);
        pos.currentTier = tier;
        cacheHits++;
      } else {
        // Compute new evaluation
        const multipvRec = recommendMultipv(pos.criticalityScore?.score ?? 0, tier);

        const options: EvaluationOptions = {
          depth: tierConfig.depth,
          timeLimitMs: tierConfig.timeLimitMs,
          numLines: multipvRec.multipv,
          mateMinTimeMs: tierConfig.mateMinTimeMs,
        };

        try {
          const evals = await this.engine.evaluateMultiPv(pos.fen, options);
          const firstEval = evals[0];
          if (firstEval) {
            pos.evalBefore = firstEval;
            pos.currentTier = tier;

            // Cache the result
            this.cacheEval(pos.positionKey.key, tier, evals);
          }
        } catch {
          // Continue on error, leave evalBefore undefined
        }

        cacheMisses++;
      }

      this.reportProgress(stageName, i + 1, positions.length);
    }

    return {
      stage: this.getStageNumber(tier),
      stageName,
      tier,
      positionsAnalyzed: positions.length,
      cacheHits,
      cacheMisses,
      timeMs: Date.now() - startTime,
    };
  }

  /**
   * Select positions for promotion to a higher tier
   */
  private selectForPromotion(
    positions: PositionState[],
    targetTier: AnalysisTier,
    threshold: number,
  ): PositionState[] {
    // Filter positions that meet the threshold and aren't already at this tier
    const candidates = positions.filter((pos) => {
      const score = pos.criticalityScore?.score ?? 0;
      return score >= threshold && this.tierOrder(pos.currentTier) < this.tierOrder(targetTier);
    });

    // Sort by criticality (highest first)
    candidates.sort((a, b) => (b.criticalityScore?.score ?? 0) - (a.criticalityScore?.score ?? 0));

    // Limit to maxCriticalRatio
    const maxCount = Math.ceil(positions.length * this.config.maxCriticalRatio);
    return candidates.slice(0, maxCount);
  }

  /**
   * Get tier order for comparison
   */
  private tierOrder(tier: AnalysisTier): number {
    const order: Record<AnalysisTier, number> = {
      shallow: 0,
      standard: 1,
      full: 2,
    };
    return order[tier];
  }

  /**
   * Get stage number for a tier
   */
  private getStageNumber(tier: AnalysisTier): number {
    const stageMap: Record<AnalysisTier, number> = {
      shallow: 1,
      standard: 3,
      full: 4,
    };
    return stageMap[tier];
  }

  /**
   * Get cached evaluation
   */
  private getCachedEval(positionKey: string, tier: AnalysisTier): EngineEvalArtifact | undefined {
    if (!this.cache) return undefined;
    return this.cache.getEngineEvalForTier(positionKey, tier);
  }

  /**
   * Cache an evaluation result
   */
  private cacheEval(positionKey: string, tier: AnalysisTier, evals: EngineEvaluation[]): void {
    if (!this.cache || evals.length === 0) return;

    const firstEval = evals[0]!;
    const pvLines: PVLine[] = evals.map((e) => ({
      cp: e.cp ?? 0,
      mate: e.mate ?? 0,
      movesUci: e.pv ?? [],
    }));

    const artifact = createEngineEvalArtifact(
      positionKey,
      tier,
      firstEval.depth,
      evals.length,
      pvLines,
      this.config.engineVersion,
      'default',
      0, // timeMs not available
    );

    this.cache.setEngineEval(artifact);
  }

  /**
   * Convert engine eval artifact to evaluation
   */
  private artifactToEval(artifact: EngineEvalArtifact): EngineEvaluation {
    const firstLine = artifact.pvLines[0];
    const result: EngineEvaluation = {
      depth: artifact.depth,
      pv: firstLine?.movesUci ?? [],
    };
    if (artifact.cp !== undefined) {
      result.cp = artifact.cp;
    }
    if (artifact.mate !== undefined) {
      result.mate = artifact.mate;
    }
    return result;
  }

  /**
   * Build final game analysis from position states
   */
  private buildGameAnalysis(game: ParsedGameInput, positions: PositionState[]): GameAnalysis {
    const moves: MoveAnalysis[] = game.moves.map((move, index) => {
      const posState = positions[index];
      const nextPosState = positions[index + 1];

      // Build a default evaluation for missing data
      const defaultEval: EngineEvaluation = {
        cp: 0,
        depth: 0,
        pv: [],
      };

      const evalBefore = posState?.evalBefore ?? defaultEval;
      const evalAfter = nextPosState?.evalBefore ?? defaultEval;

      return {
        plyIndex: index,
        moveNumber: move.moveNumber,
        isWhiteMove: move.isWhiteMove,
        san: move.san,
        fenBefore: move.fenBefore,
        fenAfter: move.fenAfter,
        evalBefore,
        evalAfter,
        bestMove: evalBefore.pv[0] ?? move.san,
        cpLoss: 0, // Computed separately
        classification: 'good' as const,
        isCriticalMoment:
          (posState?.criticalityScore?.score ?? 0) >= this.config.tierThresholds.standardPromotion,
      };
    });

    const metadata: import('../types/analysis.js').GameMetadata = {
      white: game.metadata.white,
      black: game.metadata.black,
      result: game.metadata.result,
    };
    if (game.metadata.event !== undefined) {
      metadata.event = game.metadata.event;
    }
    if (game.metadata.date !== undefined) {
      metadata.date = game.metadata.date;
    }
    if (game.metadata.eco !== undefined) {
      metadata.eco = game.metadata.eco;
    }
    if (game.metadata.whiteElo !== undefined) {
      metadata.whiteElo = game.metadata.whiteElo;
    }
    if (game.metadata.blackElo !== undefined) {
      metadata.blackElo = game.metadata.blackElo;
    }

    return {
      metadata,
      moves,
      criticalMoments: [],
      stats: {
        totalMoves: Math.ceil(game.moves.length / 2),
        totalPlies: game.moves.length,
        white: this.emptyPlayerStats(),
        black: this.emptyPlayerStats(),
        phaseTransitions: [],
      },
    };
  }

  /**
   * Create empty player stats
   */
  private emptyPlayerStats(): import('../types/analysis.js').PlayerStats {
    return {
      accuracy: 0,
      averageCpLoss: 0,
      blunders: 0,
      mistakes: 0,
      inaccuracies: 0,
      excellentMoves: 0,
      brilliantMoves: 0,
    };
  }

  /**
   * Report progress
   */
  private reportProgress(phase: string, current: number, total: number): void {
    if (this.onProgress) {
      this.onProgress(phase, current, total);
    }
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: ProgressCallback): void {
    this.onProgress = callback;
  }
}

/**
 * Create a staged analysis pipeline
 */
export function createStagedPipeline(
  engine: EngineService,
  maia?: MaiaService,
  openings?: OpeningService,
  config?: StagedPipelineConfig,
): StagedAnalysisPipeline {
  return new StagedAnalysisPipeline(engine, maia, openings, config);
}
