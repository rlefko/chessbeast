/**
 * Tension detection for chess positions
 *
 * Detects hanging pieces, promotion threats, and other tactical
 * tension that indicates a position is not yet "resolved".
 */

import { ChessPosition } from './position.js';

/**
 * Result of tension detection
 */
export interface TensionResult {
  /** Whether tension was detected */
  hasTension: boolean;
  /** Human-readable reasons for tension */
  reasons: string[];
}

/** Piece value in centipawns (for material calculations) */
const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0, // King can't be "won"
};

/**
 * Get readable piece name
 */
function pieceName(type: string): string {
  const names: Record<string, string> = {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
  };
  return names[type] ?? type;
}

/**
 * Detect hanging pieces (undefended pieces under attack)
 *
 * A piece is "hanging" if it's attacked and either:
 * - Not defended at all, OR
 * - Defended by pieces worth more than the attacker
 *
 * @param pos - Chess position to analyze
 * @returns TensionResult indicating if hanging pieces exist
 */
export function hasHangingPieces(pos: ChessPosition): TensionResult {
  const reasons: string[] = [];
  const pieces = pos.getAllPieces();
  const turn = pos.turn();
  const enemy = turn === 'w' ? 'b' : 'w';

  // Check each enemy piece to see if it's hanging
  for (const piece of pieces) {
    if (piece.color !== enemy) continue;
    if (piece.type === 'k') continue; // King can't be "won"

    const square = piece.square;
    const attackers = pos.getAttackers(square, turn);

    if (attackers.length === 0) continue; // Not attacked

    // Piece is attacked - check if it's defended
    const defenders = pos.getAttackers(square, enemy);

    if (defenders.length === 0) {
      // Completely undefended piece under attack
      reasons.push(`${pieceName(piece.type)} on ${square} is undefended`);
      continue;
    }

    // Check if lowest-value attacker can win material
    // Find the lowest value attacker
    let lowestAttackerValue = Infinity;
    for (const attackerSquare of attackers) {
      const attacker = pos.getPiece(attackerSquare);
      if (attacker) {
        const value = PIECE_VALUES[attacker.type] ?? 0;
        lowestAttackerValue = Math.min(lowestAttackerValue, value);
      }
    }

    const pieceValue = PIECE_VALUES[piece.type] ?? 0;

    // If the attacker is worth less than the piece, it's likely winning material
    if (lowestAttackerValue < pieceValue) {
      reasons.push(`${pieceName(piece.type)} on ${square} can be won`);
    }
  }

  // Also check if any of our pieces are hanging
  for (const piece of pieces) {
    if (piece.color !== turn) continue;
    if (piece.type === 'k') continue;

    const square = piece.square;
    const attackers = pos.getAttackers(square, enemy);

    if (attackers.length === 0) continue;

    const defenders = pos.getAttackers(square, turn);

    if (defenders.length === 0) {
      reasons.push(`our ${pieceName(piece.type)} on ${square} is en prise`);
    }
  }

  return {
    hasTension: reasons.length > 0,
    reasons,
  };
}

/**
 * Detect advanced passed pawns threatening promotion
 *
 * A pawn is a "promotion threat" if it's on the 6th or 7th rank
 * and its promotion square isn't blocked by an enemy piece.
 *
 * @param pos - Chess position to analyze
 * @returns TensionResult indicating promotion threats
 */
export function hasPromotionThreat(pos: ChessPosition): TensionResult {
  const reasons: string[] = [];
  const pieces = pos.getAllPieces();

  for (const piece of pieces) {
    if (piece.type !== 'p') continue;

    const rank = piece.square[1]!;
    const file = piece.square[0]!;

    if (piece.color === 'w') {
      // White pawn on 6th or 7th rank
      if (rank === '7') {
        const promoSquare = `${file}8`;
        const blocker = pos.getPiece(promoSquare);
        if (!blocker || blocker.color !== 'b') {
          reasons.push(`white pawn on ${piece.square} threatens promotion`);
        }
      } else if (rank === '6') {
        // 6th rank - still a threat
        const pathSquare = `${file}7`;
        const blocker = pos.getPiece(pathSquare);
        if (!blocker) {
          reasons.push(`white pawn on ${piece.square} is advancing`);
        }
      }
    } else {
      // Black pawn on 2nd or 3rd rank
      if (rank === '2') {
        const promoSquare = `${file}1`;
        const blocker = pos.getPiece(promoSquare);
        if (!blocker || blocker.color !== 'w') {
          reasons.push(`black pawn on ${piece.square} threatens promotion`);
        }
      } else if (rank === '3') {
        // 3rd rank (for black) - still a threat
        const pathSquare = `${file}2`;
        const blocker = pos.getPiece(pathSquare);
        if (!blocker) {
          reasons.push(`black pawn on ${piece.square} is advancing`);
        }
      }
    }
  }

  return {
    hasTension: reasons.length > 0,
    reasons,
  };
}

/**
 * Detect check tension (king currently in check or can give check)
 *
 * @param pos - Chess position to analyze
 * @returns TensionResult indicating check-related tension
 */
export function hasCheckTension(pos: ChessPosition): TensionResult {
  const reasons: string[] = [];

  if (pos.isCheck()) {
    reasons.push('in check');
  }

  // Check if any legal move gives check
  const legalMoves = pos.getLegalMoves();
  const checksAvailable = legalMoves.filter(
    (m) => m.includes('+') || m.includes('#'),
  );

  if (checksAvailable.length > 0) {
    if (checksAvailable.some((m) => m.includes('#'))) {
      reasons.push('mate available');
    } else {
      reasons.push('check available');
    }
  }

  return {
    hasTension: reasons.length > 0,
    reasons,
  };
}

/**
 * Aggregate tension detection
 *
 * Combines all tension checks: hanging pieces, promotion threats,
 * and check tension.
 *
 * @param pos - Chess position to analyze
 * @returns TensionResult combining all detected tension
 */
export function detectTension(pos: ChessPosition): TensionResult {
  const results = [
    hasCheckTension(pos),
    hasHangingPieces(pos),
    hasPromotionThreat(pos),
  ];

  const allReasons = results.flatMap((r) => r.reasons);

  return {
    hasTension: allReasons.length > 0,
    reasons: allReasons,
  };
}
