/**
 * Move reference validation to detect hallucinated moves
 */

/**
 * Standard algebraic notation (SAN) regex pattern
 * Matches moves like: e4, Nf3, Bxc6, O-O, O-O-O, exd5, Qh7+, Rxa1#, e8=Q
 * Uses lookahead instead of \b at the end to properly capture +/# symbols
 */
const SAN_PATTERN =
  /\b([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O-O|O-O)(?![a-zA-Z0-9])/g;

/**
 * Long algebraic notation pattern (e.g., e2-e4, Ng1-f3)
 * Uses lookahead instead of \b at the end to properly capture +/# symbols
 */
const LONG_ALGEBRAIC_PATTERN = /\b([KQRBN]?[a-h][1-8]-[a-h][1-8](?:=[QRBN])?[+#]?)(?![a-zA-Z0-9])/g;

/**
 * Extract all move references from text
 */
export function extractMoveReferences(text: string): string[] {
  const sanMatches = text.match(SAN_PATTERN) ?? [];
  const longMatches = text.match(LONG_ALGEBRAIC_PATTERN) ?? [];

  // Deduplicate and combine
  const allMoves = new Set([...sanMatches, ...longMatches]);
  return [...allMoves];
}

/**
 * Check if a move is in the list of legal moves
 */
export function isLegalMove(move: string, legalMoves: string[]): boolean {
  // Direct match
  if (legalMoves.includes(move)) return true;

  // Try without check/checkmate symbols
  const withoutSymbols = move.replace(/[+#]$/, '');
  if (legalMoves.some((m) => m.replace(/[+#]$/, '') === withoutSymbols)) return true;

  return false;
}

/**
 * Result of validating move references in text
 */
export interface MoveValidationResult {
  /** All moves found in text */
  foundMoves: string[];
  /** Moves that are legal in the position */
  validMoves: string[];
  /** Moves that appear hallucinated (not legal) */
  hallucinations: string[];
  /** Whether any hallucinations were found */
  hasHallucinations: boolean;
}

/**
 * Validate all move references in a piece of text
 */
export function validateMoveReferences(text: string, legalMoves: string[]): MoveValidationResult {
  const foundMoves = extractMoveReferences(text);
  const validMoves: string[] = [];
  const hallucinations: string[] = [];

  for (const move of foundMoves) {
    if (isLegalMove(move, legalMoves)) {
      validMoves.push(move);
    } else {
      hallucinations.push(move);
    }
  }

  return {
    foundMoves,
    validMoves,
    hallucinations,
    hasHallucinations: hallucinations.length > 0,
  };
}

/**
 * Remove hallucinated move references from text
 * This is a soft fix - replaces specific moves with generic terms
 */
export function sanitizeMoveReferences(text: string, hallucinations: string[]): string {
  let result = text;

  for (const move of hallucinations) {
    // Escape special regex characters
    const escaped = move.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Replace with a generic term, preserving some context
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'g'), 'the suggested move');
  }

  return result;
}

/**
 * Check if text contains any move-like patterns
 */
export function containsMoveReferences(text: string): boolean {
  return SAN_PATTERN.test(text) || LONG_ALGEBRAIC_PATTERN.test(text);
}
