/**
 * Rating-dependent classification thresholds
 *
 * Thresholds are more lenient for lower-rated players and stricter for higher-rated.
 * Values are in centipawns (cp).
 */

/**
 * Thresholds for a specific rating band
 */
export interface ClassificationThresholds {
  /** Minimum rating for this band */
  minRating: number;
  /** Maximum rating for this band (exclusive) */
  maxRating: number;
  /** Centipawn loss to classify as inaccuracy (min, max) */
  inaccuracyRange: [number, number];
  /** Centipawn loss to classify as mistake (min, max) */
  mistakeRange: [number, number];
  /** Minimum centipawn loss to classify as blunder */
  blunderThreshold: number;
  /** Maximum centipawn loss to be considered excellent */
  excellentThreshold: number;
  /** Maximum centipawn loss to be considered good */
  goodThreshold: number;
}

/**
 * Rating bands with corresponding thresholds
 * Based on research and common practices (lichess, chess.com)
 */
export const RATING_THRESHOLDS: ClassificationThresholds[] = [
  {
    // Beginners (< 1000)
    minRating: 0,
    maxRating: 1000,
    inaccuracyRange: [100, 249],
    mistakeRange: [250, 499],
    blunderThreshold: 500,
    excellentThreshold: 10,
    goodThreshold: 50,
  },
  {
    // Novice (1000-1200)
    minRating: 1000,
    maxRating: 1200,
    inaccuracyRange: [75, 199],
    mistakeRange: [200, 399],
    blunderThreshold: 400,
    excellentThreshold: 10,
    goodThreshold: 40,
  },
  {
    // Intermediate (1200-1400)
    minRating: 1200,
    maxRating: 1400,
    inaccuracyRange: [50, 149],
    mistakeRange: [150, 299],
    blunderThreshold: 300,
    excellentThreshold: 8,
    goodThreshold: 30,
  },
  {
    // Club (1400-1600)
    minRating: 1400,
    maxRating: 1600,
    inaccuracyRange: [40, 119],
    mistakeRange: [120, 249],
    blunderThreshold: 250,
    excellentThreshold: 6,
    goodThreshold: 25,
  },
  {
    // Strong Club (1600-1800)
    minRating: 1600,
    maxRating: 1800,
    inaccuracyRange: [35, 99],
    mistakeRange: [100, 199],
    blunderThreshold: 200,
    excellentThreshold: 5,
    goodThreshold: 20,
  },
  {
    // Expert (1800-2000)
    minRating: 1800,
    maxRating: 2000,
    inaccuracyRange: [30, 89],
    mistakeRange: [90, 179],
    blunderThreshold: 180,
    excellentThreshold: 5,
    goodThreshold: 18,
  },
  {
    // Candidate Master (2000-2200)
    minRating: 2000,
    maxRating: 2200,
    inaccuracyRange: [25, 74],
    mistakeRange: [75, 149],
    blunderThreshold: 150,
    excellentThreshold: 4,
    goodThreshold: 15,
  },
  {
    // Master (2200-2400)
    minRating: 2200,
    maxRating: 2400,
    inaccuracyRange: [20, 59],
    mistakeRange: [60, 119],
    blunderThreshold: 120,
    excellentThreshold: 3,
    goodThreshold: 12,
  },
  {
    // IM/GM (2400+)
    minRating: 2400,
    maxRating: 4000,
    inaccuracyRange: [15, 49],
    mistakeRange: [50, 99],
    blunderThreshold: 100,
    excellentThreshold: 2,
    goodThreshold: 10,
  },
];

/**
 * Get thresholds for a specific rating
 *
 * @param rating - Player's rating (or estimated rating)
 * @returns Classification thresholds for that rating band
 */
export function getThresholdsForRating(rating: number): ClassificationThresholds {
  // Clamp rating to valid range
  const clampedRating = Math.max(0, Math.min(rating, 3999));

  // Find the matching band
  const band = RATING_THRESHOLDS.find(
    (t) => clampedRating >= t.minRating && clampedRating < t.maxRating,
  );

  // Should always find a band, but default to intermediate if not
  return (
    band ??
    RATING_THRESHOLDS.find((t) => t.minRating === 1200 && t.maxRating === 1400)!
  );
}

/**
 * Interpolate thresholds between rating bands for smoother transitions
 *
 * @param rating - Player's rating
 * @returns Interpolated thresholds
 */
export function getInterpolatedThresholds(rating: number): ClassificationThresholds {
  const clampedRating = Math.max(0, Math.min(rating, 3999));

  // Find surrounding bands
  let lower: ClassificationThresholds | undefined;
  let upper: ClassificationThresholds | undefined;

  for (let i = 0; i < RATING_THRESHOLDS.length; i++) {
    const band = RATING_THRESHOLDS[i]!;
    if (clampedRating >= band.minRating && clampedRating < band.maxRating) {
      lower = band;
      upper = RATING_THRESHOLDS[i + 1];
      break;
    }
  }

  // If at the highest band or no interpolation needed
  if (!lower || !upper) {
    return getThresholdsForRating(rating);
  }

  // Calculate interpolation factor (0-1 within the band)
  const bandWidth = lower.maxRating - lower.minRating;
  const positionInBand = clampedRating - lower.minRating;
  const factor = positionInBand / bandWidth;

  // Interpolate all values
  const lerp = (a: number, b: number): number => a + (b - a) * factor;

  return {
    minRating: lower.minRating,
    maxRating: lower.maxRating,
    inaccuracyRange: [
      Math.round(lerp(lower.inaccuracyRange[0], upper.inaccuracyRange[0])),
      Math.round(lerp(lower.inaccuracyRange[1], upper.inaccuracyRange[1])),
    ],
    mistakeRange: [
      Math.round(lerp(lower.mistakeRange[0], upper.mistakeRange[0])),
      Math.round(lerp(lower.mistakeRange[1], upper.mistakeRange[1])),
    ],
    blunderThreshold: Math.round(lerp(lower.blunderThreshold, upper.blunderThreshold)),
    excellentThreshold: Math.round(lerp(lower.excellentThreshold, upper.excellentThreshold)),
    goodThreshold: Math.round(lerp(lower.goodThreshold, upper.goodThreshold)),
  };
}

/**
 * Default rating to use when none is available
 */
export const DEFAULT_RATING = 1500;

/**
 * Thresholds for critical moment detection
 */
export const CRITICAL_MOMENT_THRESHOLDS = {
  /** Minimum evaluation swing (cp) to be considered critical */
  minEvalSwing: 100,
  /** Large evaluation swing (cp) */
  largeEvalSwing: 200,
  /** Very large evaluation swing (cp) - definitely critical */
  veryLargeEvalSwing: 300,
  /** Winning threshold (cp) - position is winning */
  winningThreshold: 200,
  /** Clearly winning threshold (cp) */
  clearlyWinning: 500,
  /** Maximum percentage of moves to mark as critical */
  maxCriticalRatio: 0.25,
  /** Minimum interestingness score to be included */
  minInterestingnessScore: 30,
};
