/**
 * Fork Detection
 *
 * Detects forks in chess positions:
 * - Knight fork: Knight attacking 2+ pieces
 * - Pawn fork: Pawn attacking 2+ pieces
 * - General fork: Any piece attacking 2+ valuable pieces
 * - Double check: Two pieces giving check simultaneously
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color, LocatedPiece } from '../types.js';
import {
  getPieceValue,
  pieceName,
  formatPieceAtSquare,
  getKnightMoves,
  getPawnCaptureSquares,
  findKing,
} from '../utils/piece-utils.js';

/**
 * Detect all forks in the position
 */
export function detectForks(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  // Check for double check first (special case)
  const doubleCheck = detectDoubleCheck(pos);
  if (doubleCheck) {
    themes.push(doubleCheck);
  }

  // Detect forks by each color
  for (const color of ['w', 'b'] as Color[]) {
    themes.push(...detectForksForColor(pos, color));
  }

  return themes;
}

/**
 * Detect double check (two pieces giving check)
 */
function detectDoubleCheck(pos: ChessPosition): DetectedTheme | null {
  if (!pos.isCheck()) return null;

  const sideToMove = pos.turn();
  const attackerColor = sideToMove === 'w' ? 'b' : 'w';
  const kingSquare = findKing(pos, sideToMove);

  if (!kingSquare) return null;

  const checkers = pos.getAttackers(kingSquare, attackerColor);

  if (checkers.length >= 2) {
    const checkerPieces: string[] = [];
    for (const sq of checkers) {
      const piece = pos.getPiece(sq);
      if (piece) {
        checkerPieces.push(formatPieceAtSquare({ ...piece, square: sq }));
      }
    }

    return {
      id: 'double_check',
      category: 'tactical',
      confidence: 'high',
      severity: 'critical',
      squares: [kingSquare, ...checkers],
      pieces: checkerPieces,
      beneficiary: attackerColor,
      explanation: `Double check from ${checkerPieces.join(' and ')}`,
      materialAtStake: 0, // King must move
    };
  }

  return null;
}

/**
 * Detect forks created by pieces of a specific color
 */
function detectForksForColor(pos: ChessPosition, attackerColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = attackerColor === 'w' ? 'b' : 'w';
  const attackerPieces = pos.getAllPieces().filter((p) => p.color === attackerColor);
  const enemyPieces = pos.getAllPieces().filter((p) => p.color === enemyColor);

  // For each of our pieces, check if it attacks 2+ enemy pieces
  for (const attacker of attackerPieces) {
    const attackedPieces = getAttackedPieces(pos, attacker, enemyPieces);

    // Need at least 2 attacked pieces for a fork
    if (attackedPieces.length < 2) continue;

    // Calculate total value at risk (minimum of attacked pieces)
    const values = attackedPieces.map((p) => getPieceValue(p.type));
    const materialAtStake = Math.min(...values);

    // Only count as significant fork if valuable pieces involved
    const hasRoyalTarget = attackedPieces.some((p) => p.type === 'k' || p.type === 'q');
    const hasValuableTargets = materialAtStake >= 300; // At least minor piece value

    if (!hasRoyalTarget && !hasValuableTargets) continue;

    // Determine fork type
    const themeId = getForkType(attacker.type);
    const severity = hasRoyalTarget ? 'critical' : hasValuableTargets ? 'significant' : 'minor';

    const targetDescriptions = attackedPieces.map((p) => pieceName(p.type)).join(' and ');

    themes.push({
      id: themeId,
      category: 'tactical',
      confidence: 'high',
      severity,
      squares: [attacker.square, ...attackedPieces.map((p) => p.square)],
      pieces: [
        formatPieceAtSquare(attacker as LocatedPiece),
        ...attackedPieces.map((p) => formatPieceAtSquare(p)),
      ],
      beneficiary: attackerColor,
      explanation: `${pieceName(attacker.type)} on ${attacker.square} forks ${targetDescriptions}`,
      materialAtStake,
    });
  }

  return themes;
}

/**
 * Get all enemy pieces attacked by a specific piece
 */
function getAttackedPieces(
  pos: ChessPosition,
  attacker: { type: string; color: string; square: string },
  enemyPieces: Array<{ type: string; color: string; square: string }>,
): LocatedPiece[] {
  const attacked: LocatedPiece[] = [];

  for (const enemy of enemyPieces) {
    if (isAttacking(pos, attacker, enemy.square)) {
      attacked.push(enemy as LocatedPiece);
    }
  }

  return attacked;
}

/**
 * Check if a piece is attacking a square
 */
function isAttacking(
  pos: ChessPosition,
  attacker: { type: string; color: string; square: string },
  targetSquare: string,
): boolean {
  const attackerColor = attacker.color as 'w' | 'b';

  switch (attacker.type) {
    case 'n':
      // Knight attacks via knight move pattern
      return getKnightMoves(attacker.square).includes(targetSquare);

    case 'p':
      // Pawn attacks diagonally
      return getPawnCaptureSquares(attacker.square, attackerColor).includes(targetSquare);

    case 'k': {
      // King attacks adjacent squares
      const kf = attacker.square.charCodeAt(0);
      const kr = parseInt(attacker.square[1]!, 10);
      const tf = targetSquare.charCodeAt(0);
      const tr = parseInt(targetSquare[1]!, 10);
      return Math.abs(kf - tf) <= 1 && Math.abs(kr - tr) <= 1;
    }

    default:
      // For sliding pieces (B, R, Q), use chess.js attackers
      return pos.getAttackers(targetSquare, attackerColor).includes(attacker.square);
  }
}

/**
 * Get the fork theme type based on attacker piece type
 */
function getForkType(pieceType: string): 'knight_fork' | 'pawn_fork' | 'fork' | 'double_attack' {
  switch (pieceType.toLowerCase()) {
    case 'n':
      return 'knight_fork';
    case 'p':
      return 'pawn_fork';
    default:
      return 'fork';
  }
}

/**
 * Detect potential forks (forks available after one move)
 * This is more expensive as it requires move simulation
 */
export function detectPotentialForks(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const sideToMove = pos.turn();
  const enemyColor = sideToMove === 'w' ? 'b' : 'w';
  const legalMoves = pos.getLegalMoves();

  // For each legal move, check if it creates a fork
  for (const move of legalMoves) {
    // Skip non-piece moves that are unlikely to create forks
    // (This is an optimization - we can remove it for thoroughness)

    const clonedPos = pos.clone();
    try {
      clonedPos.move(move);
    } catch {
      continue;
    }

    // Find pieces that moved
    const enemyPieces = clonedPos.getAllPieces().filter((p) => p.color === enemyColor);

    // Check all our pieces for new forks
    const ourPieces = clonedPos.getAllPieces().filter((p) => p.color === sideToMove);

    for (const attacker of ourPieces) {
      const attackedPieces = getAttackedPieces(clonedPos, attacker, enemyPieces);

      // Only significant forks (attacking 2+ pieces, including royal)
      if (attackedPieces.length < 2) continue;

      const hasRoyalTarget = attackedPieces.some((p) => p.type === 'k' || p.type === 'q');
      if (!hasRoyalTarget) continue;

      const materialAtStake = Math.min(...attackedPieces.map((p) => getPieceValue(p.type)));
      const themeId = getForkType(attacker.type);

      themes.push({
        id: themeId,
        category: 'tactical',
        confidence: 'medium', // Lower confidence since it's a potential fork
        severity: 'significant',
        squares: [attacker.square, ...attackedPieces.map((p) => p.square)],
        pieces: [
          formatPieceAtSquare(attacker as LocatedPiece),
          ...attackedPieces.map((p) => formatPieceAtSquare(p)),
        ],
        beneficiary: sideToMove,
        explanation: `${move} creates a fork with ${pieceName(attacker.type)}`,
        materialAtStake,
      });

      // Only report the first significant fork per move
      break;
    }
  }

  // Deduplicate by attacker square (keep highest severity)
  const uniqueThemes = new Map<string, DetectedTheme>();
  for (const theme of themes) {
    const key = theme.squares?.[0] ?? '';
    const existing = uniqueThemes.get(key);
    if (!existing || (theme.materialAtStake ?? 0) > (existing.materialAtStake ?? 0)) {
      uniqueThemes.set(key, theme);
    }
  }

  return Array.from(uniqueThemes.values()).slice(0, 5); // Limit to 5 potential forks
}
