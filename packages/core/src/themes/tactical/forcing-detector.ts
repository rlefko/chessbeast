/**
 * Forcing Move Detection
 *
 * Detects forcing tactical themes:
 * - Attraction: Force enemy piece to a bad square
 * - Decoy: Lure piece away from defensive duty
 * - Interference: Block communication between enemy pieces
 * - Clearance: Clear a line/square for another piece
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color, LocatedPiece } from '../types.js';
import { getPieceValue, pieceName, formatPieceAtSquare } from '../utils/piece-utils.js';
import {
  getSquaresBetween,
  getDirectionsForPiece,
  getSquaresInDirection,
} from '../utils/ray-casting.js';

/**
 * Detect all forcing move themes
 */
export function detectForcingMoves(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  for (const color of ['w', 'b'] as Color[]) {
    themes.push(...detectAttraction(pos, color));
    themes.push(...detectDecoy(pos, color));
    themes.push(...detectInterference(pos, color));
    themes.push(...detectClearance(pos, color));
  }

  return themes;
}

/**
 * Detect attraction - forcing enemy to bad square
 *
 * Look for captures/checks that force enemy piece to worse square
 */
function detectAttraction(pos: ChessPosition, attackerColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor: Color = attackerColor === 'w' ? 'b' : 'w';
  const legalMoves = pos.getLegalMoves();

  // Find forcing moves (captures and checks)
  for (const move of legalMoves) {
    const from = move.substring(0, 2);
    const to = move.substring(2, 4);
    const fromPiece = pos.getPiece(from);
    const toPiece = pos.getPiece(to);

    if (!fromPiece || fromPiece.color !== attackerColor) continue;

    // Only analyze captures
    if (!toPiece || toPiece.color !== enemyColor) continue;

    // Simulate the move
    const cloned = pos.clone();
    try {
      cloned.move(move);

      // Check if enemy must recapture on a bad square
      const recaptureMoves = cloned.getLegalMoves().filter((m) => m.substring(2, 4) === to);

      if (recaptureMoves.length > 0) {
        // Check if recapturing leads to worse position
        for (const recapture of recaptureMoves) {
          const recapFrom = recapture.substring(0, 2);
          const recapPiece = cloned.getPiece(recapFrom);

          if (recapPiece) {
            // Check if piece on 'to' would be attacked more than defended
            const afterRecap = cloned.clone();
            try {
              afterRecap.move(recapture);
              const attackers = afterRecap.getAttackers(to, attackerColor);
              const defenders = afterRecap.getAttackers(to, enemyColor);

              if (attackers.length > defenders.length) {
                themes.push({
                  id: 'attraction',
                  category: 'tactical',
                  confidence: 'medium',
                  severity: 'significant',
                  squares: [from, to, recapFrom],
                  pieces: [formatPieceAtSquare(fromPiece as LocatedPiece)],
                  beneficiary: attackerColor,
                  explanation: `${pieceName(fromPiece.type)} attracts ${pieceName(recapPiece.type)} to ${to} where it can be attacked`,
                  materialAtStake: getPieceValue(recapPiece.type),
                });
                break;
              }
            } catch {
              // Invalid recapture
            }
          }
        }
      }
    } catch {
      // Invalid move
    }
  }

  return themes.slice(0, 2); // Limit to 2 attraction themes
}

/**
 * Detect decoy - luring piece from defensive duty
 *
 * Look for moves that force a defender away from what it protects
 */
function detectDecoy(pos: ChessPosition, attackerColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor: Color = attackerColor === 'w' ? 'b' : 'w';

  const pieces = pos.getAllPieces();
  const enemyPieces = pieces.filter((p) => p.color === enemyColor && p.type !== 'k');

  // For each enemy piece, check if it's a critical defender
  for (const defender of enemyPieces) {
    // Find what this piece defends
    const defends: string[] = [];

    for (const piece of pieces) {
      if (piece.color !== enemyColor || piece.square === defender.square) continue;
      if (piece.type === 'k') continue;

      // Check if defender attacks this piece's square
      const defenderAttacks = getAttackedSquares(pos, defender);
      if (defenderAttacks.includes(piece.square)) {
        // Check if this piece needs defense (is attacked)
        if (pos.isSquareAttacked(piece.square, attackerColor)) {
          defends.push(piece.square);
        }
      }
    }

    if (defends.length === 0) continue;

    // Check if we can force this defender away
    const legalMoves = pos.getLegalMoves();
    for (const move of legalMoves) {
      const to = move.substring(2, 4);

      // Can we attack the defender and force it to move?
      if (to === defender.square) {
        // This is a capture of the defender
        const from = move.substring(0, 2);
        const attacker = pos.getPiece(from);

        if (attacker && attacker.color === attackerColor) {
          // Check if capturing defender exposes defended piece
          const defendedPiece = defends[0];
          if (defendedPiece) {
            const defendedValue = pos.getPiece(defendedPiece);
            if (defendedValue) {
              themes.push({
                id: 'decoy',
                category: 'tactical',
                confidence: 'medium',
                severity: getPieceValue(defendedValue.type) >= 500 ? 'critical' : 'significant',
                squares: [from, defender.square, defendedPiece],
                pieces: [
                  formatPieceAtSquare(attacker as LocatedPiece),
                  formatPieceAtSquare(defender as LocatedPiece),
                ],
                beneficiary: attackerColor,
                explanation: `Capturing ${pieceName(defender.type)} decoys it from defending ${pieceName(defendedValue.type)}`,
                materialAtStake: getPieceValue(defendedValue.type),
              });
            }
          }
        }
      }
    }
  }

  return themes.slice(0, 2);
}

/**
 * Get squares attacked by a piece
 */
function getAttackedSquares(pos: ChessPosition, piece: LocatedPiece): string[] {
  const attacked: string[] = [];
  const directions = getDirectionsForPiece(piece.type);

  if (directions.length > 0) {
    // Sliding piece
    for (const dir of directions) {
      const squares = getSquaresInDirection(piece.square, dir);
      for (const sq of squares) {
        attacked.push(sq);
        if (pos.getPiece(sq)) break;
      }
    }
  } else if (piece.type === 'n') {
    // Knight
    const knightMoves: [number, number][] = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];
    const file = piece.square.charCodeAt(0) - 97;
    const rank = parseInt(piece.square[1]!, 10) - 1;

    for (const move of knightMoves) {
      const df = move[0];
      const dr = move[1];
      const newFile = file + df;
      const newRank = rank + dr;
      if (newFile >= 0 && newFile <= 7 && newRank >= 0 && newRank <= 7) {
        attacked.push(String.fromCharCode(97 + newFile) + (newRank + 1));
      }
    }
  } else if (piece.type === 'p') {
    // Pawn attacks
    const file = piece.square.charCodeAt(0) - 97;
    const rank = parseInt(piece.square[1]!, 10) - 1;
    const direction = piece.color === 'w' ? 1 : -1;

    for (const df of [-1, 1]) {
      const newFile = file + df;
      const newRank = rank + direction;
      if (newFile >= 0 && newFile <= 7 && newRank >= 0 && newRank <= 7) {
        attacked.push(String.fromCharCode(97 + newFile) + (newRank + 1));
      }
    }
  } else if (piece.type === 'k') {
    // King
    const file = piece.square.charCodeAt(0) - 97;
    const rank = parseInt(piece.square[1]!, 10) - 1;

    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (df === 0 && dr === 0) continue;
        const newFile = file + df;
        const newRank = rank + dr;
        if (newFile >= 0 && newFile <= 7 && newRank >= 0 && newRank <= 7) {
          attacked.push(String.fromCharCode(97 + newFile) + (newRank + 1));
        }
      }
    }
  }

  return attacked;
}

/**
 * Detect interference - blocking enemy piece communication
 *
 * Look for moves that block a line between enemy pieces
 */
function detectInterference(pos: ChessPosition, attackerColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor: Color = attackerColor === 'w' ? 'b' : 'w';

  const pieces = pos.getAllPieces();
  const enemySlidingPieces = pieces.filter(
    (p) => p.color === enemyColor && (p.type === 'r' || p.type === 'b' || p.type === 'q'),
  );

  // Find lines between enemy sliding pieces and their defended pieces
  for (const slider of enemySlidingPieces) {
    const directions = getDirectionsForPiece(slider.type);

    for (const dir of directions) {
      const squares = getSquaresInDirection(slider.square, dir);

      // Find first enemy piece on this ray
      for (const sq of squares) {
        const piece = pos.getPiece(sq);
        if (piece) {
          if (piece.color === enemyColor && piece.type !== 'k') {
            // This is a defended piece - check if we can interfere
            const between = getSquaresBetween(slider.square, sq);

            for (const betweenSq of between) {
              // Check if we can put a piece here
              if (!pos.getPiece(betweenSq)) {
                // Check if we have a move to this square
                const legalMoves = pos.getLegalMoves();
                const interfereMoves = legalMoves.filter((m) => m.substring(2, 4) === betweenSq);

                if (interfereMoves.length > 0) {
                  const move = interfereMoves[0]!;
                  const from = move.substring(0, 2);
                  const attacker = pos.getPiece(from);

                  if (attacker && attacker.color === attackerColor) {
                    themes.push({
                      id: 'interference',
                      category: 'tactical',
                      confidence: 'low',
                      severity: 'minor',
                      squares: [from, betweenSq, slider.square, sq],
                      pieces: [formatPieceAtSquare(attacker as LocatedPiece)],
                      beneficiary: attackerColor,
                      explanation: `${pieceName(attacker.type)} can interfere between ${pieceName(slider.type)} and ${pieceName(piece.type)}`,
                      materialAtStake: getPieceValue(piece.type),
                    });
                  }
                }
              }
            }
          }
          break; // Stop at first piece
        }
      }
    }
  }

  return themes.slice(0, 2);
}

/**
 * Detect clearance - clearing a line/square for another piece
 *
 * Look for moves that open a line for a more powerful attack
 */
function detectClearance(pos: ChessPosition, attackerColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor: Color = attackerColor === 'w' ? 'b' : 'w';

  const pieces = pos.getAllPieces();
  const friendlySlidingPieces = pieces.filter(
    (p) => p.color === attackerColor && (p.type === 'r' || p.type === 'b' || p.type === 'q'),
  );

  // For each friendly sliding piece, check if moving a blocker reveals attack
  for (const slider of friendlySlidingPieces) {
    const directions = getDirectionsForPiece(slider.type);

    for (const dir of directions) {
      const squares = getSquaresInDirection(slider.square, dir);

      // Find first piece on this ray
      for (let i = 0; i < squares.length; i++) {
        const sq = squares[i]!;
        const piece = pos.getPiece(sq);

        if (piece) {
          // Is this a friendly piece that could move?
          if (piece.color === attackerColor && piece.type !== 'k') {
            // Check what's behind this piece
            const remaining = squares.slice(i + 1);
            for (const targetSq of remaining) {
              const targetPiece = pos.getPiece(targetSq);
              if (targetPiece) {
                if (targetPiece.color === enemyColor) {
                  // Moving the blocker would reveal attack on enemy piece
                  themes.push({
                    id: 'clearance',
                    category: 'tactical',
                    confidence: 'low',
                    severity: getPieceValue(targetPiece.type) >= 500 ? 'significant' : 'minor',
                    squares: [sq, slider.square, targetSq],
                    pieces: [
                      formatPieceAtSquare(piece as LocatedPiece),
                      formatPieceAtSquare(slider as LocatedPiece),
                    ],
                    beneficiary: attackerColor,
                    explanation: `Moving ${pieceName(piece.type)} clears line for ${pieceName(slider.type)} to attack ${pieceName(targetPiece.type)}`,
                    materialAtStake: getPieceValue(targetPiece.type),
                  });
                }
                break; // Stop at first piece behind blocker
              }
            }
          }
          break; // Stop at first piece on ray
        }
      }
    }
  }

  return themes.slice(0, 2);
}
