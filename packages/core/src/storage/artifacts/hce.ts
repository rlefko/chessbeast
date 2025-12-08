/**
 * HCE (Handcrafted Evaluation) Artifact
 *
 * Immutable artifact storing Stockfish 16's classical evaluation breakdown.
 * SF16 provides detailed positional factors that newer versions don't expose.
 */

import type { BaseArtifact, AnalysisTier } from './base.js';

/**
 * Middlegame/Endgame score pair (in centipawns)
 *
 * Chess evaluation uses separate values for middlegame and endgame,
 * which are blended based on the game phase.
 */
export interface PhaseScore {
  /** Middlegame score (centipawns) */
  mg: number;

  /** Endgame score (centipawns) */
  eg: number;
}

/**
 * Create a zero phase score
 */
export function zeroPhaseScore(): PhaseScore {
  return { mg: 0, eg: 0 };
}

/**
 * Blend phase scores based on game phase
 *
 * @param score - Phase score to blend
 * @param phase - Game phase (0 = pure endgame, 1 = pure middlegame)
 * @returns Blended score in centipawns
 */
export function blendPhaseScore(score: PhaseScore, phase: number): number {
  return Math.round(score.mg * phase + score.eg * (1 - phase));
}

/**
 * HCE factor categories from Stockfish 16's eval command
 */
export interface HCEFactors {
  /** Material count */
  material: PhaseScore;

  /** Material imbalance (e.g., bishop pair) */
  imbalance: PhaseScore;

  /** Pawn structure (isolated, doubled, passed, etc.) */
  pawns: PhaseScore;

  /** Knight placement and activity */
  knights: PhaseScore;

  /** Bishop placement and activity */
  bishops: PhaseScore;

  /** Rook placement and activity (open files, 7th rank) */
  rooks: PhaseScore;

  /** Queen placement and activity */
  queens: PhaseScore;

  /** Piece mobility (number of legal moves) */
  mobility: PhaseScore;

  /** King safety (pawn shelter, attacks, etc.) */
  kingSafety: PhaseScore;

  /** Threats (hanging pieces, attacks) */
  threats: PhaseScore;

  /** Passed pawn evaluation */
  passed: PhaseScore;

  /** Space control */
  space: PhaseScore;

  /** Winnability factor (endgame winning chances) */
  winnable: PhaseScore;
}

/**
 * Create default (zero) HCE factors
 */
export function createDefaultHCEFactors(): HCEFactors {
  return {
    material: zeroPhaseScore(),
    imbalance: zeroPhaseScore(),
    pawns: zeroPhaseScore(),
    knights: zeroPhaseScore(),
    bishops: zeroPhaseScore(),
    rooks: zeroPhaseScore(),
    queens: zeroPhaseScore(),
    mobility: zeroPhaseScore(),
    kingSafety: zeroPhaseScore(),
    threats: zeroPhaseScore(),
    passed: zeroPhaseScore(),
    space: zeroPhaseScore(),
    winnable: zeroPhaseScore(),
  };
}

/**
 * Immutable HCE (classical evaluation) artifact
 */
export interface HCEArtifact extends BaseArtifact {
  readonly kind: 'hce';

  /** Analysis tier */
  readonly tier: AnalysisTier;

  /** HCE factor breakdown */
  readonly factors: HCEFactors;

  /** Final blended evaluation (centipawns, white's perspective) */
  readonly finalEvalCp: number;

  /** Game phase (0 = endgame, 1 = middlegame) */
  readonly gamePhase: number;

  /** Phase in percentage for display */
  readonly phasePercent: number;

  /** Total material (for phase calculation) */
  readonly totalMaterial: number;
}

/**
 * Create an HCE artifact from SF16 eval output
 */
export function createHCEArtifact(
  positionKey: string,
  tier: AnalysisTier,
  factors: HCEFactors,
  gamePhase: number,
  totalMaterial: number,
): HCEArtifact {
  // Calculate final eval by blending all factors
  let finalEval = 0;
  for (const [_, score] of Object.entries(factors) as [string, PhaseScore][]) {
    finalEval += blendPhaseScore(score, gamePhase);
  }

  return {
    kind: 'hce',
    positionKey,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
    tier,
    factors,
    finalEvalCp: finalEval,
    gamePhase,
    phasePercent: Math.round(gamePhase * 100),
    totalMaterial,
  };
}

/**
 * Get the top N positive factors (advantages)
 */
export function getTopPositiveFactors(
  artifact: HCEArtifact,
  n: number = 3,
): Array<{ name: string; score: number }> {
  const results: Array<{ name: string; score: number }> = [];

  for (const [name, phaseScore] of Object.entries(artifact.factors)) {
    const blended = blendPhaseScore(phaseScore, artifact.gamePhase);
    if (blended > 0) {
      results.push({ name, score: blended });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, n);
}

/**
 * Get the top N negative factors (weaknesses)
 */
export function getTopNegativeFactors(
  artifact: HCEArtifact,
  n: number = 3,
): Array<{ name: string; score: number }> {
  const results: Array<{ name: string; score: number }> = [];

  for (const [name, phaseScore] of Object.entries(artifact.factors)) {
    const blended = blendPhaseScore(phaseScore, artifact.gamePhase);
    if (blended < 0) {
      results.push({ name, score: blended });
    }
  }

  return results.sort((a, b) => a.score - b.score).slice(0, n);
}

/**
 * Human-readable factor names
 */
export const HCE_FACTOR_NAMES: Record<keyof HCEFactors, string> = {
  material: 'Material',
  imbalance: 'Material Imbalance',
  pawns: 'Pawn Structure',
  knights: 'Knights',
  bishops: 'Bishops',
  rooks: 'Rooks',
  queens: 'Queens',
  mobility: 'Mobility',
  kingSafety: 'King Safety',
  threats: 'Threats',
  passed: 'Passed Pawns',
  space: 'Space',
  winnable: 'Winning Chances',
};

/**
 * Get human-readable factor name
 */
export function getFactorName(factor: keyof HCEFactors): string {
  return HCE_FACTOR_NAMES[factor] ?? factor;
}

/**
 * Format a factor score for display
 */
export function formatFactorScore(score: number): string {
  const sign = score >= 0 ? '+' : '';
  return `${sign}${(score / 100).toFixed(2)}`;
}

/**
 * Get a summary of the HCE evaluation
 */
export function getHCESummary(artifact: HCEArtifact): string {
  const positives = getTopPositiveFactors(artifact, 2);
  const negatives = getTopNegativeFactors(artifact, 2);

  const parts: string[] = [];

  if (positives.length > 0) {
    const pos = positives.map(
      (p) => `${getFactorName(p.name as keyof HCEFactors)} ${formatFactorScore(p.score)}`,
    );
    parts.push(`Strengths: ${pos.join(', ')}`);
  }

  if (negatives.length > 0) {
    const neg = negatives.map(
      (n) => `${getFactorName(n.name as keyof HCEFactors)} ${formatFactorScore(n.score)}`,
    );
    parts.push(`Weaknesses: ${neg.join(', ')}`);
  }

  parts.push(`Phase: ${artifact.phasePercent}% middlegame`);

  return parts.join('. ');
}

/**
 * Estimate game phase from material count
 *
 * Phase calculation based on non-pawn material:
 * - Starting: 2Q + 4R + 4B + 4N = 2*9 + 4*5 + 4*3 + 4*3 = 62 per side
 * - Total: 124 non-pawn material
 */
export function estimateGamePhase(totalMaterial: number): number {
  const maxMaterial = 124;
  const minMaterial = 0;

  const clampedMaterial = Math.max(minMaterial, Math.min(maxMaterial, totalMaterial));
  return clampedMaterial / maxMaterial;
}

/**
 * Parse SF16 eval output into HCE factors
 *
 * This is a placeholder - actual parsing depends on SF16 output format.
 */
export function parseSF16EvalOutput(_output: string): HCEFactors | null {
  // TODO: Implement actual parsing of SF16 eval command output
  // The format is:
  //  Term    |    White    |    Black    |    Total
  //          |   MG    EG  |   MG    EG  |   MG    EG
  // ---------+-------------+-------------+-------------
  // Material |  ----  ---- |  ----  ---- |  +0.00 +0.00
  // ...

  return null;
}
