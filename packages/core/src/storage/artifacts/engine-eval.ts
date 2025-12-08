/**
 * Engine Evaluation Artifact
 *
 * Immutable artifact storing Stockfish analysis results for a position.
 * Keyed by (positionKey, depth, multipv, engineVersion, optionsHash).
 */

import type { BaseArtifact, AnalysisTier } from './base.js';

/**
 * A principal variation line from engine analysis
 */
export interface PVLine {
  /** Evaluation in centipawns (from side-to-move perspective) */
  cp: number;

  /** Mate in N (positive = mating, negative = getting mated, 0 = no mate) */
  mate: number;

  /** Move sequence in UCI notation */
  movesUci: string[];

  /** Move sequence in SAN notation (computed lazily, may be undefined) */
  movesSan?: string[];
}

/**
 * Win/Draw/Loss probabilities in permille (0-1000)
 *
 * These sum to 1000 and represent the estimated outcome probabilities
 * based on the evaluation and WDL model (if available from engine).
 */
export interface WDLProbs {
  /** Win probability (0-1000) */
  win: number;

  /** Draw probability (0-1000) */
  draw: number;

  /** Loss probability (0-1000) */
  loss: number;
}

/**
 * Immutable engine evaluation artifact
 *
 * Contains the complete analysis results from Stockfish for a position,
 * including evaluation, principal variations, and metadata.
 */
export interface EngineEvalArtifact extends BaseArtifact {
  readonly kind: 'engine_eval';

  /** Analysis tier that produced this evaluation */
  readonly tier: AnalysisTier;

  /** Search depth reached */
  readonly depth: number;

  /** Number of principal variations computed */
  readonly multipv: number;

  /** Primary evaluation in centipawns (from side-to-move perspective) */
  readonly cp?: number;

  /** Mate in N (if applicable) */
  readonly mate?: number;

  /** WDL probabilities if available from engine */
  readonly wdl?: WDLProbs;

  /** Principal variations (best lines) */
  readonly pvLines: PVLine[];

  /** Engine version string (e.g., 'stockfish-17') */
  readonly engineVersion: string;

  /** Hash of engine options (threads, hash, etc.) for cache invalidation */
  readonly optionsHash: string;

  /** Time spent in milliseconds */
  readonly timeMs: number;

  /** Nodes searched (if reported by engine) */
  readonly nodes?: number;

  /** Selective depth (if reported by engine) */
  readonly seldepth?: number;
}

/**
 * Create an engine evaluation artifact from analysis results
 *
 * @param positionKey - Position key string
 * @param tier - Analysis tier used
 * @param depth - Search depth reached
 * @param multipv - Number of PV lines
 * @param pvLines - Principal variations
 * @param engineVersion - Engine version
 * @param optionsHash - Engine options hash
 * @param timeMs - Analysis time in milliseconds
 * @param options - Optional additional fields (nodes, seldepth, wdl)
 */
export function createEngineEvalArtifact(
  positionKey: string,
  tier: AnalysisTier,
  depth: number,
  multipv: number,
  pvLines: PVLine[],
  engineVersion: string,
  optionsHash: string,
  timeMs: number,
  options?: {
    nodes?: number;
    seldepth?: number;
    wdl?: WDLProbs;
  },
): EngineEvalArtifact {
  const primaryLine = pvLines[0];

  const artifact: EngineEvalArtifact = {
    kind: 'engine_eval',
    positionKey,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,

    tier,
    depth,
    multipv,

    pvLines,

    engineVersion,
    optionsHash,
    timeMs,
  };

  if (primaryLine?.cp !== undefined) {
    (artifact as { cp: number }).cp = primaryLine.cp;
  }
  if (primaryLine?.mate !== undefined && primaryLine.mate !== 0) {
    (artifact as { mate: number }).mate = primaryLine.mate;
  }
  if (options?.wdl !== undefined) {
    (artifact as { wdl: WDLProbs }).wdl = options.wdl;
  }
  if (options?.nodes !== undefined) {
    (artifact as { nodes: number }).nodes = options.nodes;
  }
  if (options?.seldepth !== undefined) {
    (artifact as { seldepth: number }).seldepth = options.seldepth;
  }

  return artifact;
}

/**
 * Check if an evaluation meets minimum requirements
 *
 * @param artifact - Engine evaluation artifact
 * @param minDepth - Minimum required depth
 * @param minMultipv - Minimum required number of PV lines
 * @returns true if artifact meets requirements
 */
export function evalMeetsRequirements(
  artifact: EngineEvalArtifact,
  minDepth: number,
  minMultipv: number,
): boolean {
  return artifact.depth >= minDepth && artifact.multipv >= minMultipv;
}

/**
 * Get the best move from an evaluation artifact
 *
 * @param artifact - Engine evaluation artifact
 * @returns Best move in UCI notation, or undefined if no PV
 */
export function getBestMove(artifact: EngineEvalArtifact): string | undefined {
  return artifact.pvLines[0]?.movesUci[0];
}

/**
 * Get the evaluation score in centipawns (handles mate scores)
 *
 * @param artifact - Engine evaluation artifact
 * @param mateValue - Value to assign to mate (default: 10000)
 * @returns Evaluation in centipawns
 */
export function getEvalCp(artifact: EngineEvalArtifact, mateValue: number = 10000): number {
  const primaryLine = artifact.pvLines[0];
  if (!primaryLine) return 0;

  if (primaryLine.mate !== 0) {
    // Mate in N: positive = winning, negative = losing
    return primaryLine.mate > 0 ? mateValue : -mateValue;
  }

  return primaryLine.cp;
}

/**
 * Check if the position is a forced mate
 *
 * @param artifact - Engine evaluation artifact
 * @returns Mate in N (positive = winning, negative = losing) or 0 if no mate
 */
export function getMateIn(artifact: EngineEvalArtifact): number {
  return artifact.pvLines[0]?.mate ?? 0;
}

/**
 * Convert WDL probabilities to win probability percentage (0-100)
 *
 * @param wdl - WDL probabilities in permille
 * @returns Win probability as percentage (0-100)
 */
export function wdlToWinProbability(wdl: WDLProbs): number {
  // Win + half of draw = expected score
  return (wdl.win + wdl.draw / 2) / 10;
}

/**
 * Estimate WDL from centipawn evaluation (if engine doesn't provide it)
 *
 * Uses the Lichess WDL model approximation.
 *
 * @param cp - Evaluation in centipawns
 * @param ply - Current ply (affects draw probability)
 * @returns Estimated WDL probabilities
 */
export function estimateWdlFromCp(cp: number, _ply: number = 30): WDLProbs {
  // Win probability (white's perspective in original model)
  // We adjust based on the sign of cp
  const normalizedCp = Math.max(-1000, Math.min(1000, cp));
  const x = normalizedCp / 100;

  // Simplified logistic model
  const winProb = 1 / (1 + Math.exp(-x * 0.6));
  const lossProb = 1 / (1 + Math.exp(x * 0.6));

  // Scale to permille and ensure sum is 1000
  const scaledWin = Math.round(winProb * 1000);
  const scaledLoss = Math.round(lossProb * 1000);
  const scaledDraw = 1000 - scaledWin - scaledLoss;

  return {
    win: Math.max(0, scaledWin),
    draw: Math.max(0, scaledDraw),
    loss: Math.max(0, scaledLoss),
  };
}
