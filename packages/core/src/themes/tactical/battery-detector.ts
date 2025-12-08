/**
 * Battery Detection
 *
 * Detects aligned piece formations:
 * - Battery: Two pieces aligned on same file/diagonal/rank
 * - Queen-Bishop battery: Queen and bishop on same diagonal
 * - Doubled rooks: Two rooks on same file
 * - Alekhine's gun: Queen behind two rooks on a file
 * - Rooks on 7th: Two rooks on 7th/2nd rank
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color, LocatedPiece } from '../types.js';
import { formatPieceAtSquare } from '../utils/piece-utils.js';
import { isClearPath } from '../utils/ray-casting.js';
import {
  areOnSameFile,
  areOnSameRank,
  areOnSameDiagonal,
  rankIndex,
} from '../utils/square-utils.js';

/**
 * Detect all battery formations in the position
 */
export function detectBatteries(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  for (const color of ['w', 'b'] as Color[]) {
    themes.push(...detectBatteriesForColor(pos, color));
    themes.push(...detectDoubledRooks(pos, color));
    themes.push(...detectRooksOnSeventh(pos, color));
    themes.push(...detectAlekhinesGun(pos, color));
  }

  return themes;
}

/**
 * Detect queen-bishop and rook-queen batteries
 */
function detectBatteriesForColor(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const pieces = pos.getAllPieces().filter((p) => p.color === color);

  const queens = pieces.filter((p) => p.type === 'q');
  const bishops = pieces.filter((p) => p.type === 'b');
  const rooks = pieces.filter((p) => p.type === 'r');

  // Queen-Bishop battery (diagonal)
  for (const queen of queens) {
    for (const bishop of bishops) {
      if (areOnSameDiagonal(queen.square, bishop.square)) {
        // Check if path is clear between them
        if (isClearPath(pos, queen.square, bishop.square)) {
          themes.push({
            id: 'queen_bishop_battery',
            category: 'tactical',
            confidence: 'high',
            severity: 'significant',
            squares: [queen.square, bishop.square],
            pieces: [
              formatPieceAtSquare(queen as LocatedPiece),
              formatPieceAtSquare(bishop as LocatedPiece),
            ],
            beneficiary: color,
            explanation: `Queen and bishop form battery on diagonal`,
          });
        }
      }
    }
  }

  // Rook-Queen battery (file or rank)
  for (const queen of queens) {
    for (const rook of rooks) {
      const onSameFile = areOnSameFile(queen.square, rook.square);
      const onSameRank = areOnSameRank(queen.square, rook.square);

      if ((onSameFile || onSameRank) && isClearPath(pos, queen.square, rook.square)) {
        themes.push({
          id: 'battery',
          category: 'tactical',
          confidence: 'high',
          severity: 'significant',
          squares: [queen.square, rook.square],
          pieces: [
            formatPieceAtSquare(queen as LocatedPiece),
            formatPieceAtSquare(rook as LocatedPiece),
          ],
          beneficiary: color,
          explanation: `Queen and rook form battery on ${onSameFile ? 'file' : 'rank'}`,
        });
      }
    }
  }

  return themes;
}

/**
 * Detect doubled rooks on same file
 */
function detectDoubledRooks(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const rooks = pos.getAllPieces().filter((p) => p.color === color && p.type === 'r');

  if (rooks.length < 2) return themes;

  // Check all pairs of rooks
  for (let i = 0; i < rooks.length; i++) {
    for (let j = i + 1; j < rooks.length; j++) {
      const rook1 = rooks[i]!;
      const rook2 = rooks[j]!;

      if (areOnSameFile(rook1.square, rook2.square)) {
        // Check if path is clear
        if (isClearPath(pos, rook1.square, rook2.square)) {
          // Determine which rook is "front" (closer to enemy)
          const frontRank = color === 'w' ? 8 : 1;
          const rook1Dist = Math.abs(rankIndex(rook1.square) - frontRank);
          const rook2Dist = Math.abs(rankIndex(rook2.square) - frontRank);
          const front = rook1Dist < rook2Dist ? rook1 : rook2;
          const back = rook1Dist < rook2Dist ? rook2 : rook1;

          themes.push({
            id: 'rooks_doubled',
            category: 'tactical',
            confidence: 'high',
            severity: 'significant',
            squares: [front.square, back.square],
            pieces: [
              formatPieceAtSquare(front as LocatedPiece),
              formatPieceAtSquare(back as LocatedPiece),
            ],
            beneficiary: color,
            explanation: `Doubled rooks on the ${rook1.square[0]}-file`,
          });
        }
      }
    }
  }

  return themes;
}

/**
 * Detect rooks on 7th/2nd rank
 */
function detectRooksOnSeventh(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const seventhRank = color === 'w' ? 7 : 2;
  const rooks = pos.getAllPieces().filter((p) => p.color === color && p.type === 'r');

  const rooksOnSeventh = rooks.filter((r) => rankIndex(r.square) === seventhRank);

  if (rooksOnSeventh.length >= 2) {
    // Check if they are connected (clear path between them)
    const rook1 = rooksOnSeventh[0]!;
    const rook2 = rooksOnSeventh[1]!;

    if (isClearPath(pos, rook1.square, rook2.square)) {
      themes.push({
        id: 'rooks_seventh',
        category: 'tactical',
        confidence: 'high',
        severity: 'critical',
        squares: [rook1.square, rook2.square],
        pieces: [
          formatPieceAtSquare(rook1 as LocatedPiece),
          formatPieceAtSquare(rook2 as LocatedPiece),
        ],
        beneficiary: color,
        explanation: `Connected rooks on the ${seventhRank}${color === 'w' ? 'th' : 'nd'} rank`,
      });
    } else {
      // Still significant even if not connected
      themes.push({
        id: 'rooks_seventh',
        category: 'tactical',
        confidence: 'medium',
        severity: 'significant',
        squares: rooksOnSeventh.map((r) => r.square),
        pieces: rooksOnSeventh.map((r) => formatPieceAtSquare(r as LocatedPiece)),
        beneficiary: color,
        explanation: `Two rooks on the ${seventhRank}${color === 'w' ? 'th' : 'nd'} rank`,
      });
    }
  } else if (rooksOnSeventh.length === 1) {
    // Single rook on 7th is still notable
    const rook = rooksOnSeventh[0]!;
    themes.push({
      id: 'rooks_seventh',
      category: 'tactical',
      confidence: 'high',
      severity: 'minor',
      squares: [rook.square],
      pieces: [formatPieceAtSquare(rook as LocatedPiece)],
      beneficiary: color,
      explanation: `Rook on the ${seventhRank}${color === 'w' ? 'th' : 'nd'} rank`,
    });
  }

  return themes;
}

/**
 * Detect Alekhine's gun: Queen behind two rooks on same file
 */
function detectAlekhinesGun(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const pieces = pos.getAllPieces().filter((p) => p.color === color);

  const queens = pieces.filter((p) => p.type === 'q');
  const rooks = pieces.filter((p) => p.type === 'r');

  if (queens.length < 1 || rooks.length < 2) return themes;

  for (const queen of queens) {
    // Find rooks on same file as queen
    const rooksOnFile = rooks.filter((r) => areOnSameFile(r.square, queen.square));

    if (rooksOnFile.length < 2) continue;

    // Check if queen is behind both rooks (furthest from enemy)
    const queenRank = rankIndex(queen.square);
    const rook1Rank = rankIndex(rooksOnFile[0]!.square);
    const rook2Rank = rankIndex(rooksOnFile[1]!.square);

    // For white, queen should have lower rank; for black, higher rank
    const queenIsBehind =
      color === 'w'
        ? queenRank < rook1Rank && queenRank < rook2Rank
        : queenRank > rook1Rank && queenRank > rook2Rank;

    if (queenIsBehind) {
      // Check paths are clear
      const sortedPieces = [queen, ...rooksOnFile].sort((a, b) =>
        color === 'w'
          ? rankIndex(a.square) - rankIndex(b.square)
          : rankIndex(b.square) - rankIndex(a.square),
      );

      const pathClear =
        isClearPath(pos, sortedPieces[0]!.square, sortedPieces[1]!.square) &&
        isClearPath(pos, sortedPieces[1]!.square, sortedPieces[2]!.square);

      if (pathClear) {
        themes.push({
          id: 'alekhines_gun',
          category: 'tactical',
          confidence: 'high',
          severity: 'critical',
          squares: sortedPieces.map((p) => p.square),
          pieces: sortedPieces.map((p) => formatPieceAtSquare(p as LocatedPiece)),
          beneficiary: color,
          explanation: `Alekhine's gun: Queen behind doubled rooks on the ${queen.square[0]}-file`,
        });
      }
    }
  }

  return themes;
}
