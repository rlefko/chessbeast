/**
 * NAG (Numeric Annotation Glyph) validation and utilities
 *
 * NAGs are a standard PGN notation for annotating chess moves.
 * This module provides validation, conversion, and description functions.
 */

/**
 * Move classification categories
 * Note: This type is also defined in @chessbeast/core. We define it here
 * to avoid a circular dependency (core depends on pgn).
 */
export type MoveClassification =
  | 'book'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'brilliant'
  | 'forced';

/**
 * Standard NAG codes used in PGN
 */
export const VALID_NAGS = new Set([
  '$1', // ! - Good move
  '$2', // ? - Poor move / mistake
  '$3', // !! - Very good move / brilliant
  '$4', // ?? - Very poor move / blunder
  '$5', // !? - Speculative / interesting move
  '$6', // ?! - Questionable move
  '$7', // Forced move (only move)
  '$10', // = - Drawish position
  '$11', // = - Equal chances, quiet position
  '$12', // = - Equal chances, active position
  '$13', // ∞ - Unclear position
  '$14', // += - White has a slight advantage
  '$15', // =+ - Black has a slight advantage
  '$16', // ± - White has a moderate advantage
  '$17', // ∓ - Black has a moderate advantage
  '$18', // +- - White has a decisive advantage
  '$19', // -+ - Black has a decisive advantage
  '$22', // ⨀ - Zugzwang
  '$23', // ⨀ - Zugzwang (Black)
  '$32', // Development advantage (White)
  '$33', // Development advantage (Black)
  '$36', // Initiative (White)
  '$37', // Initiative (Black)
  '$40', // Attack (White)
  '$41', // Attack (Black)
  '$44', // Compensation for material
  '$45', // Compensation for material (Black)
  '$132', // Counterplay (White)
  '$133', // Counterplay (Black)
  '$138', // Time pressure (White)
  '$139', // Time pressure (Black)
]);

/**
 * Common NAGs for move quality
 */
export const MOVE_QUALITY_NAGS = ['$1', '$2', '$3', '$4', '$5', '$6', '$7'];

/**
 * Check if a NAG code is valid
 */
export function isValidNag(nag: string): boolean {
  // Accept both with and without $ prefix
  const normalized = nag.startsWith('$') ? nag : `$${nag}`;
  return VALID_NAGS.has(normalized);
}

/**
 * Normalize a NAG code (ensure $ prefix)
 */
export function normalizeNag(nag: string): string {
  return nag.startsWith('$') ? nag : `$${nag}`;
}

/**
 * Map move classification to appropriate NAG code
 */
export function classificationToNag(classification: MoveClassification): string | undefined {
  const mapping: Record<MoveClassification, string | undefined> = {
    brilliant: '$3', // !!
    excellent: '$1', // !
    good: undefined, // No NAG for normal good moves
    book: undefined, // No NAG for book moves
    inaccuracy: '$6', // ?!
    mistake: '$2', // ?
    blunder: '$4', // ??
    forced: '$7', // Only move
  };
  return mapping[classification];
}

/**
 * Filter an array of NAGs to only include valid ones
 */
export function filterValidNags(nags: string[]): string[] {
  return nags.filter(isValidNag).map(normalizeNag);
}

/**
 * Get NAG description for display
 */
export function getNagDescription(nag: string): string {
  const normalized = normalizeNag(nag);
  const descriptions: Record<string, string> = {
    $1: 'Good move',
    $2: 'Mistake',
    $3: 'Brilliant move',
    $4: 'Blunder',
    $5: 'Interesting move',
    $6: 'Dubious move',
    $7: 'Only move',
    $10: 'Drawish position',
    $13: 'Unclear position',
    $14: 'White is slightly better',
    $15: 'Black is slightly better',
    $16: 'White is better',
    $17: 'Black is better',
    $18: 'White is winning',
    $19: 'Black is winning',
  };
  return descriptions[normalized] ?? 'Unknown';
}

/**
 * Get NAG symbol for display (e.g., "!" for $1)
 */
export function getNagSymbol(nag: string): string {
  const normalized = normalizeNag(nag);
  const symbols: Record<string, string> = {
    $1: '!',
    $2: '?',
    $3: '!!',
    $4: '??',
    $5: '!?',
    $6: '?!',
    $7: '□',
    $10: '=',
    $13: '∞',
    $14: '⩲',
    $15: '⩱',
    $16: '±',
    $17: '∓',
    $18: '+-',
    $19: '-+',
  };
  return symbols[normalized] ?? normalized;
}

/**
 * Position assessment NAG codes
 */
export const POSITION_NAGS = {
  equal: '$10', // =
  slightWhite: '$14', // ⩲
  slightBlack: '$15', // ⩱
  clearWhite: '$16', // ±
  clearBlack: '$17', // ∓
  winningWhite: '$18', // +-
  winningBlack: '$19', // -+
} as const;

/**
 * Thresholds for position assessment (in centipawns)
 */
interface PositionThresholds {
  /** Below this: equal */
  equal: number;
  /** Below this: slight advantage */
  slight: number;
  /** Below this: clear advantage, above: winning */
  clear: number;
}

/**
 * Get position assessment thresholds based on target rating
 *
 * Higher rated players notice smaller advantages, so thresholds are stricter.
 */
function getPositionThresholds(rating: number): PositionThresholds {
  if (rating >= 2200) {
    // Advanced/Expert: stricter thresholds
    return { equal: 15, slight: 50, clear: 150 };
  }
  if (rating >= 1800) {
    // Intermediate-advanced
    return { equal: 25, slight: 75, clear: 200 };
  }
  if (rating >= 1400) {
    // Intermediate
    return { equal: 40, slight: 100, clear: 250 };
  }
  // Beginner: more lenient thresholds
  return { equal: 50, slight: 150, clear: 300 };
}

/**
 * Convert engine evaluation to position assessment NAG
 *
 * @param cp - Centipawn evaluation (positive = White better)
 * @param mate - Mate-in-X (positive = White mating, negative = Black mating)
 * @param targetRating - Target audience rating (affects thresholds)
 * @returns Position NAG code, or undefined if position is equal
 */
export function evalToPositionNag(
  cp: number | undefined,
  mate: number | undefined,
  targetRating: number,
): string | undefined {
  // Mate always means winning
  if (mate !== undefined) {
    return mate > 0 ? POSITION_NAGS.winningWhite : POSITION_NAGS.winningBlack;
  }

  if (cp === undefined) return undefined;

  const thresholds = getPositionThresholds(targetRating);
  const absCp = Math.abs(cp);

  if (absCp < thresholds.equal) {
    return POSITION_NAGS.equal;
  }
  if (absCp < thresholds.slight) {
    return cp > 0 ? POSITION_NAGS.slightWhite : POSITION_NAGS.slightBlack;
  }
  if (absCp < thresholds.clear) {
    return cp > 0 ? POSITION_NAGS.clearWhite : POSITION_NAGS.clearBlack;
  }
  return cp > 0 ? POSITION_NAGS.winningWhite : POSITION_NAGS.winningBlack;
}
