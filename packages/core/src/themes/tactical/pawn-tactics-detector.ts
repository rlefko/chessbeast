/**
 * Pawn Tactical Theme Detection
 *
 * Detects pawn-related tactical themes:
 * - Advanced pawn: Pawn on 6th/7th rank (or 2nd/3rd for Black)
 * - Pawn breakthrough: Sacrificial pawn advance to create passer
 * - Underpromotion: Tactical underpromotion opportunities
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color } from '../types.js';
import { rankIndex, fileIndex } from '../utils/square-utils.js';

/**
 * Detect all pawn tactical themes
 */
export function detectPawnTactics(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  for (const color of ['w', 'b'] as Color[]) {
    themes.push(...detectAdvancedPawns(pos, color));
    themes.push(...detectPawnBreakthrough(pos, color));
  }

  return themes;
}

/**
 * Detect advanced pawns (pawns close to promotion)
 */
function detectAdvancedPawns(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const pawns = pos.getAllPieces().filter((p) => p.color === color && p.type === 'p');

  const criticalRank = color === 'w' ? 7 : 2; // One square from promotion
  const advancedRank = color === 'w' ? 6 : 3; // Two squares from promotion

  for (const pawn of pawns) {
    const rank = rankIndex(pawn.square);

    if (rank === criticalRank) {
      // Pawn is one square from promotion
      themes.push({
        id: 'advanced_pawn',
        category: 'tactical',
        confidence: 'high',
        severity: 'critical',
        squares: [pawn.square],
        pieces: [`P${pawn.square}`],
        beneficiary: color,
        explanation: `Pawn on ${pawn.square} is one square from promotion`,
        materialAtStake: 800, // Potential queen minus pawn value
      });
    } else if (rank === advancedRank) {
      // Pawn is two squares from promotion
      // Check if it has support or path is clear
      const nextSquare = pawn.square[0] + (color === 'w' ? '7' : '2');

      const blockingPiece = pos.getPiece(nextSquare);
      const isBlocked = blockingPiece !== null;

      themes.push({
        id: 'advanced_pawn',
        category: 'tactical',
        confidence: isBlocked ? 'medium' : 'high',
        severity: 'significant',
        squares: [pawn.square, nextSquare],
        pieces: [`P${pawn.square}`],
        beneficiary: color,
        explanation: `Advanced pawn on ${pawn.square}${isBlocked ? ' (blocked)' : ''}`,
        materialAtStake: 500,
      });
    }
  }

  return themes;
}

/**
 * Detect pawn breakthrough opportunities
 * A pawn breakthrough is when sacrificing pawns creates a passed pawn
 */
function detectPawnBreakthrough(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = color === 'w' ? 'b' : 'w';

  const ourPawns = pos.getAllPieces().filter((p) => p.color === color && p.type === 'p');
  const enemyPawns = pos.getAllPieces().filter((p) => p.color === enemyColor && p.type === 'p');

  // Look for pawn chains that could breakthrough
  // Group pawns by adjacent files
  const pawnsByFile = new Map<number, typeof ourPawns>();

  for (const pawn of ourPawns) {
    const file = fileIndex(pawn.square);
    const existing = pawnsByFile.get(file) || [];
    existing.push(pawn);
    pawnsByFile.set(file, existing);
  }

  // Check for breakthrough potential on each file
  for (let file = 0; file < 8; file++) {
    const filePawns = pawnsByFile.get(file) || [];
    const leftPawns = pawnsByFile.get(file - 1) || [];
    const rightPawns = pawnsByFile.get(file + 1) || [];

    // Need at least 2 connected pawns for breakthrough potential
    const connectedCount = filePawns.length + leftPawns.length + rightPawns.length;
    if (connectedCount < 2) continue;

    // Check if enemy has pawns on these files
    const adjacentFiles = [file - 1, file, file + 1].filter((f) => f >= 0 && f < 8);
    const enemyOnAdjacent = enemyPawns.filter((p) => adjacentFiles.includes(fileIndex(p.square)));

    // Breakthrough potential if we have pawn majority
    if (connectedCount > enemyOnAdjacent.length && enemyOnAdjacent.length > 0) {
      // Get the most advanced pawn
      const allConnected = [...filePawns, ...leftPawns, ...rightPawns];
      const sorted = allConnected.sort((a, b) =>
        color === 'w'
          ? rankIndex(b.square) - rankIndex(a.square)
          : rankIndex(a.square) - rankIndex(b.square),
      );

      const leadPawn = sorted[0];
      if (!leadPawn) continue;

      const leadRank = rankIndex(leadPawn.square);
      const threshold = color === 'w' ? 4 : 5; // Only consider if past middle

      if ((color === 'w' && leadRank >= threshold) || (color === 'b' && leadRank <= threshold)) {
        themes.push({
          id: 'pawn_breakthrough',
          category: 'tactical',
          confidence: 'medium',
          severity: 'significant',
          squares: allConnected.map((p) => p.square),
          pieces: allConnected.map((p) => `P${p.square}`),
          beneficiary: color,
          explanation: `Potential pawn breakthrough on the ${String.fromCharCode(97 + file)}-file`,
          materialAtStake: 400, // Potential to create passer
        });
      }
    }
  }

  // Deduplicate overlapping breakthrough zones
  const unique = new Map<string, DetectedTheme>();
  for (const theme of themes) {
    const key = theme.squares?.sort().join(',') ?? '';
    if (!unique.has(key)) {
      unique.set(key, theme);
    }
  }

  return Array.from(unique.values());
}

/**
 * Detect underpromotion opportunities
 * Rare but important in specific tactical situations
 */
export function detectUnderpromotion(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const sideToMove = pos.turn();
  const legalMoves = pos.getLegalMoves();

  // Find pawn moves to promotion rank
  const promotionMoves = legalMoves.filter((move) => {
    // Look for promotion suffix (=N, =B, =R) or promotion rank
    if (move.includes('=')) return true;

    // UCI format: e7e8q
    if (move.length === 5) {
      const toRank = move[3];
      return toRank === '8' || toRank === '1';
    }

    return false;
  });

  if (promotionMoves.length === 0) return themes;

  // For each promotion, simulate and check if underpromotion has tactical value
  for (const move of promotionMoves) {
    // Try the move
    const cloned = pos.clone();

    // Test knight promotion (most common tactical underpromotion)
    const knightPromo = move.replace(/[qrb]$/i, 'n').replace(/=[QRBN]/i, '=N');

    try {
      cloned.move(knightPromo);

      // Check if this creates a fork or check
      const isCheck = cloned.isCheck();

      if (isCheck) {
        // Knight promotion with check might be tactically superior
        const promoSquare = move.length >= 4 ? move.substring(2, 4) : move.substring(0, 2);

        themes.push({
          id: 'underpromotion',
          category: 'tactical',
          confidence: 'medium',
          severity: 'significant',
          squares: [promoSquare],
          pieces: [`N${promoSquare}`],
          beneficiary: sideToMove,
          explanation: `Knight promotion gives check on ${promoSquare}`,
          materialAtStake: 580, // Knight vs Queen value difference might be worth it
        });
      }
    } catch {
      // Move failed, skip
    }
  }

  return themes;
}
