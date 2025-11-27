/**
 * NAG (Numeric Annotation Glyph) validation
 */

import type { MoveClassification } from '@chessbeast/core';

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
    '$1': 'Good move',
    '$2': 'Mistake',
    '$3': 'Brilliant move',
    '$4': 'Blunder',
    '$5': 'Interesting move',
    '$6': 'Dubious move',
    '$7': 'Only move',
    '$10': 'Drawish position',
    '$13': 'Unclear position',
    '$14': 'White is slightly better',
    '$15': 'Black is slightly better',
    '$16': 'White is better',
    '$17': 'Black is better',
    '$18': 'White is winning',
    '$19': 'Black is winning',
  };
  return descriptions[normalized] ?? 'Unknown';
}
