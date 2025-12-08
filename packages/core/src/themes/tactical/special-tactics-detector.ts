/**
 * Special Tactics Detection
 *
 * Detects special/rare tactical themes:
 * - Zwischenzug: Intermediate move before expected recapture
 * - Windmill: Repeating discovered check pattern
 * - Greek Gift: Bxh7+ sacrifice pattern
 * - Sacrifice: Material sacrifice for positional/tactical gain
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color, LocatedPiece } from '../types.js';
import { findKing, getPieceValue, pieceName, formatPieceAtSquare } from '../utils/piece-utils.js';
import { getSquaresInDirection } from '../utils/ray-casting.js';
import { fileIndex, rankIndex, getDirection } from '../utils/square-utils.js';

/**
 * Detect all special tactical themes
 */
export function detectSpecialTactics(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  for (const color of ['w', 'b'] as Color[]) {
    const greekGift = detectGreekGift(pos, color);
    if (greekGift) themes.push(greekGift);

    themes.push(...detectZwischenzug(pos, color));
    themes.push(...detectWindmill(pos, color));
    themes.push(...detectSacrifice(pos, color));
  }

  return themes;
}

/**
 * Detect Greek Gift sacrifice pattern (Bxh7+)
 *
 * Classic pattern: Bishop sacrifices on h7 (or h2 for black)
 * followed by Ng5 and Qh5 checkmate attack
 */
function detectGreekGift(pos: ChessPosition, attackerColor: Color): DetectedTheme | null {
  const enemyColor: Color = attackerColor === 'w' ? 'b' : 'w';
  const targetSquare = attackerColor === 'w' ? 'h7' : 'h2';
  const ngSquare = attackerColor === 'w' ? 'g5' : 'g4';

  // Check if enemy king is castled kingside
  const enemyKing = findKing(pos, enemyColor);
  if (!enemyKing) return null;

  const kingFile = fileIndex(enemyKing);
  const kingRank = rankIndex(enemyKing);

  // King should be on f8/g8/h8 (or f1/g1/h1 for black attacking)
  const isKingsideCastled =
    (enemyColor === 'b' && kingFile >= 5 && kingRank === 7) ||
    (enemyColor === 'w' && kingFile >= 5 && kingRank === 0);

  if (!isKingsideCastled) return null;

  // Check if target square has a pawn defending (h7 pawn for black)
  const targetPiece = pos.getPiece(targetSquare);
  if (!targetPiece || targetPiece.type !== 'p' || targetPiece.color !== enemyColor) {
    return null;
  }

  // Check if we have a bishop that can capture on h7
  const pieces = pos.getAllPieces();
  const attackerBishops = pieces.filter((p) => p.color === attackerColor && p.type === 'b');

  for (const bishop of attackerBishops) {
    // Check if bishop can reach target square
    const dir = getDirection(bishop.square, targetSquare);
    if (!dir || !['ne', 'nw', 'se', 'sw'].includes(dir)) continue;

    // Check path is clear to target
    const squares = getSquaresInDirection(bishop.square, dir);
    let canReach = false;
    for (const sq of squares) {
      if (sq === targetSquare) {
        canReach = true;
        break;
      }
      if (pos.getPiece(sq)) break;
    }

    if (!canReach) continue;

    // Check if we have a knight that can go to g5/g4
    const attackerKnights = pieces.filter((p) => p.color === attackerColor && p.type === 'n');

    const hasKnightSupport = attackerKnights.some((knight) => {
      // Knight can reach g5/g4 in one move from f3, e4, h3, etc.
      const knightFile = fileIndex(knight.square);
      const knightRank = rankIndex(knight.square);
      const targetFile = fileIndex(ngSquare);
      const targetRank = rankIndex(ngSquare);

      const fileDiff = Math.abs(knightFile - targetFile);
      const rankDiff = Math.abs(knightRank - targetRank);

      return (fileDiff === 1 && rankDiff === 2) || (fileDiff === 2 && rankDiff === 1);
    });

    // Check if we have a queen that can reach h5/h4
    const attackerQueens = pieces.filter((p) => p.color === attackerColor && p.type === 'q');

    const hasQueenSupport = attackerQueens.length > 0;

    if (hasKnightSupport || hasQueenSupport) {
      return {
        id: 'greek_gift',
        category: 'tactical',
        confidence: hasKnightSupport && hasQueenSupport ? 'high' : 'medium',
        severity: 'critical',
        squares: [bishop.square, targetSquare, ngSquare],
        pieces: [formatPieceAtSquare(bishop as LocatedPiece)],
        beneficiary: attackerColor,
        explanation: `Greek gift sacrifice Bx${targetSquare}+ is possible`,
        materialAtStake: 900, // Queen-level attack
      };
    }
  }

  return null;
}

/**
 * Detect zwischenzug (intermediate move)
 *
 * After a capture, instead of recapturing, a forcing move is made first
 */
function detectZwischenzug(pos: ChessPosition, attackerColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor: Color = attackerColor === 'w' ? 'b' : 'w';

  // Get legal moves that are captures
  const legalMoves = pos.getLegalMoves();
  const captures = legalMoves.filter((move) => {
    const to = move.substring(2, 4);
    const piece = pos.getPiece(to);
    return piece && piece.color === enemyColor;
  });

  for (const capture of captures) {
    const from = capture.substring(0, 2);
    const to = capture.substring(2, 4);
    const capturedPiece = pos.getPiece(to);

    if (!capturedPiece) continue;

    // Simulate the capture
    const afterCapture = pos.clone();
    try {
      afterCapture.move(capture);

      // Check if opponent has a recapture
      const recaptures = afterCapture.getLegalMoves().filter((m) => m.substring(2, 4) === to);

      if (recaptures.length === 0) continue;

      // Instead of recapturing, check if there's a forcing move (check or capture)
      const allMoves = afterCapture.getLegalMoves();
      const forcingMoves = allMoves.filter((m) => {
        const moveTo = m.substring(2, 4);

        // Skip recaptures
        if (moveTo === to) return false;

        // Check if it's a check
        const cloned = afterCapture.clone();
        try {
          cloned.move(m);
          if (cloned.isCheck()) return true;
        } catch {
          return false;
        }

        // Check if it's a valuable capture
        const targetPiece = afterCapture.getPiece(moveTo);
        return targetPiece && getPieceValue(targetPiece.type) >= getPieceValue(capturedPiece.type);
      });

      if (forcingMoves.length > 0) {
        const zwischen = forcingMoves[0]!;
        const zwischenFrom = zwischen.substring(0, 2);
        const zwischenTo = zwischen.substring(2, 4);
        const zwischenPiece = afterCapture.getPiece(zwischenFrom);

        if (zwischenPiece) {
          themes.push({
            id: 'zwischenzug',
            category: 'tactical',
            confidence: 'medium',
            severity: 'significant',
            squares: [from, to, zwischenFrom, zwischenTo],
            pieces: [formatPieceAtSquare(zwischenPiece as LocatedPiece)],
            beneficiary: enemyColor, // Enemy has the zwischenzug after our capture
            explanation: `After ${from}x${to}, ${pieceName(zwischenPiece.type)} can play zwischenzug to ${zwischenTo}`,
            materialAtStake: getPieceValue(capturedPiece.type),
          });
        }
      }
    } catch {
      // Invalid move
    }
  }

  return themes.slice(0, 2);
}

/**
 * Detect windmill pattern
 *
 * A repeating pattern of discovered checks that wins material
 */
function detectWindmill(pos: ChessPosition, attackerColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor: Color = attackerColor === 'w' ? 'b' : 'w';
  const enemyKing = findKing(pos, enemyColor);

  if (!enemyKing) return themes;

  // Find pieces that could create a windmill
  // Typically: Rook on 7th rank with bishop giving discovered check
  const pieces = pos.getAllPieces();
  const friendlyRooks = pieces.filter((p) => p.color === attackerColor && p.type === 'r');

  for (const rook of friendlyRooks) {
    // Check if rook is on 7th/2nd rank
    const rookRank = rankIndex(rook.square);
    const isOnSeventh =
      (attackerColor === 'w' && rookRank === 6) || (attackerColor === 'b' && rookRank === 1);

    if (!isOnSeventh) continue;

    // Check if there's a bishop that could give discovered check when rook moves
    const friendlyBishops = pieces.filter((p) => p.color === attackerColor && p.type === 'b');

    for (const bishop of friendlyBishops) {
      // Check if bishop, rook, and enemy king are aligned
      const bishopToKing = getDirection(bishop.square, enemyKing);
      const bishopToRook = getDirection(bishop.square, rook.square);

      if (bishopToKing && bishopToRook && bishopToKing === bishopToRook) {
        // Rook is between bishop and king - potential windmill
        themes.push({
          id: 'windmill',
          category: 'tactical',
          confidence: 'medium',
          severity: 'critical',
          squares: [bishop.square, rook.square, enemyKing],
          pieces: [
            formatPieceAtSquare(bishop as LocatedPiece),
            formatPieceAtSquare(rook as LocatedPiece),
          ],
          beneficiary: attackerColor,
          explanation: `Windmill pattern: ${pieceName(rook.type)} on ${rook.square} with ${pieceName(bishop.type)} giving discovered checks`,
          materialAtStake: 900, // Typically wins significant material
        });
      }
    }
  }

  return themes.slice(0, 1);
}

/**
 * Detect sacrifice opportunities
 *
 * Material sacrifice that leads to checkmate or winning material back
 */
function detectSacrifice(pos: ChessPosition, attackerColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor: Color = attackerColor === 'w' ? 'b' : 'w';

  const legalMoves = pos.getLegalMoves();

  // Find captures where we lose material but gain something
  for (const move of legalMoves) {
    const from = move.substring(0, 2);
    const to = move.substring(2, 4);
    const attacker = pos.getPiece(from);
    const defender = pos.getPiece(to);

    if (!attacker || attacker.color !== attackerColor) continue;
    if (!defender || defender.color !== enemyColor) continue;

    const attackerValue = getPieceValue(attacker.type);
    const defenderValue = getPieceValue(defender.type);

    // Only look at sacrifices (losing material)
    if (attackerValue <= defenderValue) continue;
    if (attacker.type === 'p' || attacker.type === 'k') continue;

    // Check if the square is defended
    if (!pos.isSquareAttacked(to, enemyColor)) continue;

    // Simulate the sacrifice
    const afterSac = pos.clone();
    try {
      afterSac.move(move);

      // Check if it leads to checkmate
      const afterSacMoves = afterSac.getLegalMoves();
      let leadsToPressure = false;

      // Check immediate mate threat
      if (afterSac.isCheck()) {
        // We gave check with the sacrifice - strong
        leadsToPressure = true;
      }

      for (const response of afterSacMoves.slice(0, 10)) {
        const afterResponse = afterSac.clone();
        try {
          afterResponse.move(response);

          // Check if we have forcing moves after their response
          const ourMoves = afterResponse.getLegalMoves();
          for (const ourMove of ourMoves.slice(0, 5)) {
            const afterOurMove = afterResponse.clone();
            try {
              afterOurMove.move(ourMove);
              if (afterOurMove.isCheck()) {
                leadsToPressure = true;
              }
            } catch {
              // Invalid
            }
          }
        } catch {
          // Invalid
        }
      }

      if (leadsToPressure) {
        themes.push({
          id: 'sacrifice',
          category: 'tactical',
          confidence: 'low',
          severity: attackerValue >= 500 ? 'critical' : 'significant',
          squares: [from, to],
          pieces: [formatPieceAtSquare(attacker as LocatedPiece)],
          beneficiary: attackerColor,
          explanation: `${pieceName(attacker.type)} sacrifice on ${to} for attack`,
          materialAtStake: attackerValue - defenderValue,
        });
      }
    } catch {
      // Invalid move
    }
  }

  return themes.slice(0, 2);
}
