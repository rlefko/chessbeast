/**
 * Adaptive Multipv Selection
 *
 * Dynamically selects the number of principal variations to analyze
 * based on position criticality, analysis tier, and tactical complexity.
 *
 * This allows the staged pipeline to:
 * - Use fewer PVs for quiet positions (faster analysis)
 * - Use more PVs for critical/tactical positions (better coverage)
 */

import type { AnalysisTier } from '../storage/artifacts/base.js';

/**
 * Recommendation for multipv setting
 */
export interface MultipvRecommendation {
  /** Recommended number of principal variations */
  multipv: number;

  /** Human-readable reason for the recommendation */
  reason: string;
}

/**
 * Options for multipv recommendation
 */
export interface MultipvOptions {
  /** Whether the position has forcing moves (checks, captures) */
  isForcing?: boolean;

  /** Whether tactical themes are present (pins, forks, etc.) */
  hasTacticalThemes?: boolean;

  /** Current exploration depth in the variation tree */
  depthOfExploration?: number;

  /** Whether multiple reasonable moves exist */
  hasMultipleCandidates?: boolean;

  /** Override minimum multipv */
  minMultipv?: number;

  /** Override maximum multipv */
  maxMultipv?: number;
}

/**
 * Multipv bounds per tier
 */
interface TierMultipvBounds {
  min: number;
  max: number;
  default: number;
}

/**
 * Default multipv bounds for each analysis tier
 */
const TIER_MULTIPV_BOUNDS: Record<AnalysisTier, TierMultipvBounds> = {
  shallow: { min: 1, max: 1, default: 1 },
  standard: { min: 2, max: 4, default: 3 },
  full: { min: 3, max: 6, default: 5 },
};

/**
 * Criticality thresholds for multipv adjustment
 */
const CRITICALITY_THRESHOLDS = {
  /** Below this, use minimum multipv for tier */
  low: 25,
  /** Above this, use maximum multipv for tier */
  high: 70,
} as const;

/**
 * Recommend multipv based on criticality and tier
 *
 * @param criticalityScore - Position criticality score (0-100)
 * @param tier - Analysis tier
 * @param options - Additional factors
 * @returns Multipv recommendation with reason
 */
export function recommendMultipv(
  criticalityScore: number,
  tier: AnalysisTier,
  options: MultipvOptions = {},
): MultipvRecommendation {
  const bounds = TIER_MULTIPV_BOUNDS[tier];

  // Apply overrides if specified
  const minMultipv = options.minMultipv ?? bounds.min;
  const maxMultipv = options.maxMultipv ?? bounds.max;

  // Shallow tier is always 1
  if (tier === 'shallow') {
    return {
      multipv: 1,
      reason: 'shallow tier uses single PV',
    };
  }

  // Calculate base multipv from criticality
  let multipv = bounds.default;
  const reasons: string[] = [];

  // Adjust based on criticality score
  if (criticalityScore < CRITICALITY_THRESHOLDS.low) {
    multipv = minMultipv;
    reasons.push('low criticality');
  } else if (criticalityScore >= CRITICALITY_THRESHOLDS.high) {
    multipv = maxMultipv;
    reasons.push('high criticality');
  } else {
    // Linear interpolation between min and max
    const ratio =
      (criticalityScore - CRITICALITY_THRESHOLDS.low) /
      (CRITICALITY_THRESHOLDS.high - CRITICALITY_THRESHOLDS.low);
    multipv = Math.round(minMultipv + ratio * (maxMultipv - minMultipv));
    reasons.push('moderate criticality');
  }

  // Boost for forcing positions
  if (options.isForcing && multipv < maxMultipv) {
    multipv = Math.min(multipv + 1, maxMultipv);
    reasons.push('forcing position');
  }

  // Boost for tactical themes
  if (options.hasTacticalThemes && multipv < maxMultipv) {
    multipv = Math.min(multipv + 1, maxMultipv);
    reasons.push('tactical complexity');
  }

  // Reduce for deep exploration (avoid explosion)
  if (options.depthOfExploration !== undefined && options.depthOfExploration > 20) {
    const reductionFactor = Math.min(0.5, (options.depthOfExploration - 20) / 40);
    multipv = Math.max(minMultipv, Math.round(multipv * (1 - reductionFactor)));
    reasons.push('deep exploration');
  }

  // Boost if multiple candidates are viable
  if (options.hasMultipleCandidates && multipv < maxMultipv) {
    multipv = Math.min(multipv + 1, maxMultipv);
    reasons.push('multiple viable moves');
  }

  // Clamp to bounds
  multipv = Math.max(minMultipv, Math.min(maxMultipv, multipv));

  return {
    multipv,
    reason: reasons.join(', ') || `${tier} tier default`,
  };
}

/**
 * Get the default multipv for a tier
 */
export function getDefaultMultipv(tier: AnalysisTier): number {
  return TIER_MULTIPV_BOUNDS[tier].default;
}

/**
 * Get multipv bounds for a tier
 */
export function getMultipvBounds(tier: AnalysisTier): TierMultipvBounds {
  return { ...TIER_MULTIPV_BOUNDS[tier] };
}

/**
 * Check if a multipv value is valid for a tier
 */
export function isValidMultipvForTier(multipv: number, tier: AnalysisTier): boolean {
  const bounds = TIER_MULTIPV_BOUNDS[tier];
  return multipv >= bounds.min && multipv <= bounds.max;
}

/**
 * Clamp multipv to valid range for tier
 */
export function clampMultipvForTier(multipv: number, tier: AnalysisTier): number {
  const bounds = TIER_MULTIPV_BOUNDS[tier];
  return Math.max(bounds.min, Math.min(bounds.max, multipv));
}

/**
 * Quick recommendation based only on tier and criticality
 *
 * Faster than full recommendMultipv when additional factors aren't available.
 */
export function quickMultipvRecommendation(criticalityScore: number, tier: AnalysisTier): number {
  if (tier === 'shallow') return 1;

  const bounds = TIER_MULTIPV_BOUNDS[tier];

  if (criticalityScore < CRITICALITY_THRESHOLDS.low) {
    return bounds.min;
  }
  if (criticalityScore >= CRITICALITY_THRESHOLDS.high) {
    return bounds.max;
  }

  return bounds.default;
}
