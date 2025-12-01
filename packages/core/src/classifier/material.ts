/**
 * Material Balance Calculation
 *
 * Provides functions to calculate material balance from FEN positions.
 * Used for sacrifice detection and position evaluation.
 */

/**
 * Standard piece values in centipawns
 */
export const PIECE_VALUES: Record<string, number> = {
  p: 100, // pawn
  n: 320, // knight
  b: 330, // bishop
  r: 500, // rook
  q: 900, // queen
  k: 0, // king (not counted for material)
};

/**
 * Calculate total material for one side from a FEN piece placement string
 *
 * @param piecePlacement - The piece placement part of FEN (before first space)
 * @param isWhite - Whether to count white (uppercase) or black (lowercase) pieces
 * @returns Material value in centipawns
 */
function countMaterial(piecePlacement: string, isWhite: boolean): number {
  let material = 0;

  for (const char of piecePlacement) {
    // Skip rank separators and numbers
    if (char === '/' || (char >= '1' && char <= '8')) {
      continue;
    }

    const isUpperCase = char === char.toUpperCase();
    if (isUpperCase === isWhite) {
      const piece = char.toLowerCase();
      material += PIECE_VALUES[piece] ?? 0;
    }
  }

  return material;
}

/**
 * Calculate material balance from a FEN position
 *
 * @param fen - Full FEN string
 * @returns Material balance in centipawns (positive = white has more material)
 */
export function getMaterialBalance(fen: string): number {
  const piecePlacement = fen.split(' ')[0] ?? '';
  const whiteMaterial = countMaterial(piecePlacement, true);
  const blackMaterial = countMaterial(piecePlacement, false);
  return whiteMaterial - blackMaterial;
}

/**
 * Get total material for a specific side
 *
 * @param fen - Full FEN string
 * @param isWhite - Whether to count white's material
 * @returns Total material in centipawns
 */
export function getSideMaterial(fen: string, isWhite: boolean): number {
  const piecePlacement = fen.split(' ')[0] ?? '';
  return countMaterial(piecePlacement, isWhite);
}

/**
 * Calculate material change between two positions from moving player's perspective
 *
 * @param fenBefore - FEN before the move
 * @param fenAfter - FEN after the move
 * @param isWhiteMove - Whether white made this move
 * @returns Material delta (negative = player lost material)
 */
export function getMaterialDelta(
  fenBefore: string,
  fenAfter: string,
  isWhiteMove: boolean,
): number {
  const balanceBefore = getMaterialBalance(fenBefore);
  const balanceAfter = getMaterialBalance(fenAfter);

  // Change in balance from moving player's perspective
  const balanceChange = balanceAfter - balanceBefore;
  return isWhiteMove ? balanceChange : -balanceChange;
}
