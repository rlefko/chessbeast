/**
 * Pin Detection
 *
 * Detects pins in chess positions:
 * - Absolute pin: Pinned piece cannot legally move (pinned to king)
 * - Relative pin: Pinned to a more valuable piece
 * - Cross-pin: Piece pinned in two directions
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color, LocatedPiece } from '../types.js';
import {
  getSlidingPieces,
  getPieceValue,
  pieceName,
  formatPieceAtSquare,
} from '../utils/piece-utils.js';
import { getDirectionsForPiece, getPiecesOnRay, findPinsFromSquare } from '../utils/ray-casting.js';

/**
 * Detect all pins in the position
 */
export function detectPins(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  // Check pins created by white pieces
  const whitePins = detectPinsForColor(pos, 'w');
  themes.push(...whitePins);

  // Check pins created by black pieces
  const blackPins = detectPinsForColor(pos, 'b');
  themes.push(...blackPins);

  // Detect cross-pins (piece pinned in multiple directions)
  const crossPins = detectCrossPins(pos, [...whitePins, ...blackPins]);
  themes.push(...crossPins);

  return themes;
}

/**
 * Detect pins created by pieces of a specific color
 */
function detectPinsForColor(pos: ChessPosition, attackerColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const slidingPieces = getSlidingPieces(pos, attackerColor);

  for (const attacker of slidingPieces) {
    const pins = findPinsFromSquare(pos, attacker.square, attacker.type, attackerColor);

    for (const pin of pins) {
      const isAbsolute = pin.protectedPiece.type === 'k';
      const pinnedValue = getPieceValue(pin.pinnedPiece.type);
      const protectedValue = getPieceValue(pin.protectedPiece.type);

      // For relative pins, the protected piece should be more valuable
      if (!isAbsolute && protectedValue <= pinnedValue) {
        continue; // Not a meaningful pin
      }

      const themeId = isAbsolute ? 'absolute_pin' : 'relative_pin';
      const severity = isAbsolute ? 'critical' : protectedValue >= 900 ? 'significant' : 'minor';

      themes.push({
        id: themeId,
        category: 'tactical',
        confidence: 'high',
        severity,
        squares: [attacker.square, pin.pinnedPiece.square, pin.protectedPiece.square],
        pieces: [
          formatPieceAtSquare(attacker),
          formatPieceAtSquare(pin.pinnedPiece),
          formatPieceAtSquare(pin.protectedPiece),
        ],
        beneficiary: attackerColor,
        explanation: isAbsolute
          ? `${pieceName(pin.pinnedPiece.type)} on ${pin.pinnedPiece.square} is absolutely pinned to the king`
          : `${pieceName(pin.pinnedPiece.type)} on ${pin.pinnedPiece.square} is pinned to the ${pieceName(pin.protectedPiece.type)}`,
        materialAtStake: pinnedValue,
      });
    }
  }

  return themes;
}

/**
 * Detect cross-pins (piece pinned from multiple directions)
 */
function detectCrossPins(pos: ChessPosition, existingPins: DetectedTheme[]): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  // Group pins by pinned piece square
  const pinsBySquare = new Map<string, DetectedTheme[]>();
  for (const pin of existingPins) {
    if (pin.squares && pin.squares.length >= 2) {
      const pinnedSquare = pin.squares[1]!;
      const existing = pinsBySquare.get(pinnedSquare) || [];
      existing.push(pin);
      pinsBySquare.set(pinnedSquare, existing);
    }
  }

  // Find squares with multiple pins
  for (const [square, pins] of pinsBySquare) {
    if (pins.length >= 2) {
      // Cross-pin detected
      const piece = pos.getPiece(square);
      if (piece) {
        themes.push({
          id: 'cross_pin',
          category: 'tactical',
          confidence: 'high',
          severity: 'critical',
          squares: [square],
          pieces: [`${piece.type.toUpperCase()}${square}`],
          beneficiary: piece.color === 'w' ? 'b' : 'w',
          explanation: `${pieceName(piece.type)} on ${square} is cross-pinned from ${pins.length} directions`,
          materialAtStake: getPieceValue(piece.type),
        });
      }
    }
  }

  return themes;
}

/**
 * Detect situational pins (moving would lose material but not technically a pin)
 * These are cases where a piece screens another from attack
 */
export function detectSituationalPins(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  // For each side
  for (const defenderColor of ['w', 'b'] as Color[]) {
    const attackerColor = defenderColor === 'w' ? 'b' : 'w';
    const attackerSliders = getSlidingPieces(pos, attackerColor);

    for (const attacker of attackerSliders) {
      const directions = getDirectionsForPiece(attacker.type);

      for (const dir of directions) {
        const piecesOnRay = getPiecesOnRay(pos, attacker.square, dir);

        // Need at least 2 pieces on ray
        if (piecesOnRay.length < 2) continue;

        const first = piecesOnRay[0]!;
        const second = piecesOnRay[1]!;

        // Both must be defender's pieces
        if (first.color !== defenderColor || second.color !== defenderColor) continue;

        // First piece is "screening" the second
        // This is situational pin if first is less valuable than second
        const firstValue = getPieceValue(first.type);
        const secondValue = getPieceValue(second.type);

        // Skip if this is already an absolute or relative pin (king involved)
        if (first.type === 'k' || second.type === 'k') continue;

        // Situational pin: moving first piece exposes second to attack
        if (secondValue > firstValue * 1.5) {
          themes.push({
            id: 'situational_pin',
            category: 'tactical',
            confidence: 'medium',
            severity: 'minor',
            squares: [attacker.square, first.square, second.square],
            pieces: [
              formatPieceAtSquare(attacker as LocatedPiece),
              formatPieceAtSquare(first),
              formatPieceAtSquare(second),
            ],
            beneficiary: attackerColor,
            explanation: `${pieceName(first.type)} on ${first.square} screens ${pieceName(second.type)} from attack`,
            materialAtStake: secondValue,
          });
        }
      }
    }
  }

  return themes;
}
