/**
 * Skewer and X-Ray Detection
 *
 * Detects linear tactics:
 * - Skewer: Attack on valuable piece, less valuable behind
 * - X-ray attack: Piece attacks through an enemy piece
 * - X-ray defense: Piece defends through an enemy piece
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color } from '../types.js';
import {
  getSlidingPieces,
  getPieceValue,
  pieceName,
  formatPieceAtSquare,
} from '../utils/piece-utils.js';
import { getDirectionsForPiece, getPiecesOnRay } from '../utils/ray-casting.js';

/**
 * Detect all skewers and x-ray tactics in the position
 */
export function detectSkewers(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  // Check skewers by each color
  for (const color of ['w', 'b'] as Color[]) {
    themes.push(...detectSkewersForColor(pos, color));
    themes.push(...detectXRayAttacks(pos, color));
    themes.push(...detectXRayDefenses(pos, color));
  }

  return themes;
}

/**
 * Detect skewers created by pieces of a specific color
 * A skewer attacks a valuable piece with a less valuable one behind
 */
function detectSkewersForColor(pos: ChessPosition, attackerColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = attackerColor === 'w' ? 'b' : 'w';
  const slidingPieces = getSlidingPieces(pos, attackerColor);

  for (const attacker of slidingPieces) {
    const directions = getDirectionsForPiece(attacker.type);

    for (const dir of directions) {
      const piecesOnRay = getPiecesOnRay(pos, attacker.square, dir);

      // Need at least 2 pieces on the ray
      if (piecesOnRay.length < 2) continue;

      const first = piecesOnRay[0]!;
      const second = piecesOnRay[1]!;

      // For a skewer: first piece must be enemy, second must be enemy
      if (first.color !== enemyColor || second.color !== enemyColor) continue;

      const firstValue = getPieceValue(first.type);
      const secondValue = getPieceValue(second.type);

      // Skewer: first piece is MORE valuable than second
      // (After first piece moves, we capture the second)
      if (firstValue > secondValue) {
        // Material at stake is the second piece's value (what we capture after skewer)
        const materialAtStake = secondValue;

        // Severity based on what's being skewered
        const hasRoyal = first.type === 'k' || first.type === 'q';
        const severity = hasRoyal ? 'critical' : firstValue >= 500 ? 'significant' : 'minor';

        themes.push({
          id: 'skewer',
          category: 'tactical',
          confidence: 'high',
          severity,
          squares: [attacker.square, first.square, second.square],
          pieces: [
            formatPieceAtSquare(attacker),
            formatPieceAtSquare(first),
            formatPieceAtSquare(second),
          ],
          beneficiary: attackerColor,
          explanation: `${pieceName(attacker.type)} skewers ${pieceName(first.type)} to ${pieceName(second.type)}`,
          materialAtStake,
        });
      }
    }
  }

  return themes;
}

/**
 * Detect X-ray attacks (attacking through an enemy piece)
 * The attacking piece puts pressure on a square/piece behind the blocker
 */
function detectXRayAttacks(pos: ChessPosition, attackerColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = attackerColor === 'w' ? 'b' : 'w';
  const slidingPieces = getSlidingPieces(pos, attackerColor);

  for (const attacker of slidingPieces) {
    const directions = getDirectionsForPiece(attacker.type);

    for (const dir of directions) {
      const piecesOnRay = getPiecesOnRay(pos, attacker.square, dir);

      // Need at least 2 pieces on the ray
      if (piecesOnRay.length < 2) continue;

      const first = piecesOnRay[0]!;
      const second = piecesOnRay[1]!;

      // X-ray attack: first is enemy blocker, second is also enemy (valuable target)
      if (first.color !== enemyColor || second.color !== enemyColor) continue;

      // Only count if the back piece is valuable (queen or king)
      if (second.type !== 'q' && second.type !== 'k') continue;

      // Skip if this is really a skewer (front piece more valuable)
      const firstValue = getPieceValue(first.type);
      const secondValue = getPieceValue(second.type);
      if (firstValue > secondValue) continue;

      themes.push({
        id: 'x_ray_attack',
        category: 'tactical',
        confidence: 'medium',
        severity: second.type === 'k' ? 'critical' : 'significant',
        squares: [attacker.square, first.square, second.square],
        pieces: [
          formatPieceAtSquare(attacker),
          formatPieceAtSquare(first),
          formatPieceAtSquare(second),
        ],
        beneficiary: attackerColor,
        explanation: `${pieceName(attacker.type)} has x-ray pressure on ${pieceName(second.type)} through ${pieceName(first.type)}`,
        materialAtStake: secondValue,
      });
    }
  }

  return themes;
}

/**
 * Detect X-ray defenses (defending through an enemy piece)
 * A piece defends another friendly piece through an enemy blocker
 */
function detectXRayDefenses(pos: ChessPosition, defenderColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = defenderColor === 'w' ? 'b' : 'w';
  const slidingPieces = getSlidingPieces(pos, defenderColor);

  for (const defender of slidingPieces) {
    const directions = getDirectionsForPiece(defender.type);

    for (const dir of directions) {
      const piecesOnRay = getPiecesOnRay(pos, defender.square, dir);

      // Need at least 2 pieces on the ray
      if (piecesOnRay.length < 2) continue;

      const first = piecesOnRay[0]!;
      const second = piecesOnRay[1]!;

      // X-ray defense: first is enemy, second is our piece
      if (first.color !== enemyColor || second.color !== defenderColor) continue;

      // Only significant if defending something valuable
      const secondValue = getPieceValue(second.type);
      if (secondValue < 300) continue; // At least minor piece

      themes.push({
        id: 'x_ray_defense',
        category: 'tactical',
        confidence: 'medium',
        severity: secondValue >= 900 ? 'significant' : 'minor',
        squares: [defender.square, first.square, second.square],
        pieces: [
          formatPieceAtSquare(defender),
          formatPieceAtSquare(first),
          formatPieceAtSquare(second),
        ],
        beneficiary: defenderColor,
        explanation: `${pieceName(defender.type)} x-ray defends ${pieceName(second.type)} through ${pieceName(first.type)}`,
        materialAtStake: secondValue,
      });
    }
  }

  return themes;
}
