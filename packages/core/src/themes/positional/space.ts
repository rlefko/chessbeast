/**
 * Space and Control Detection
 *
 * Detects space-related positional themes:
 * - Space advantage: Control more squares in enemy territory
 * - Central control: Control of the center squares
 * - Convergence zone: Multiple pieces converging on key area
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color } from '../types.js';
import { rankIndex } from '../utils/square-utils.js';

// Center squares
const CENTER_SQUARES = ['d4', 'd5', 'e4', 'e5'];
const EXTENDED_CENTER = ['c3', 'c4', 'c5', 'c6', 'd3', 'd6', 'e3', 'e6', 'f3', 'f4', 'f5', 'f6'];

/**
 * Detect all space-related themes
 */
export function detectSpaceThemes(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  themes.push(...detectSpaceAdvantage(pos));
  themes.push(...detectCentralControl(pos));
  themes.push(...detectConvergenceZones(pos));

  return themes;
}

/**
 * Detect space advantage
 * Count controlled squares in enemy territory
 */
function detectSpaceAdvantage(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  // White's territory: ranks 5-8 (indices 4-7)
  // Black's territory: ranks 1-4 (indices 0-3)

  let whiteSpaceInBlackTerritory = 0;
  let blackSpaceInWhiteTerritory = 0;

  const whiteControlled: string[] = [];
  const blackControlled: string[] = [];

  // Count controlled squares in enemy territory
  for (let file = 0; file < 8; file++) {
    for (let rank = 0; rank < 8; rank++) {
      const square = String.fromCharCode(97 + file) + (rank + 1);

      const whiteAttacks = pos.isSquareAttacked(square, 'w');
      const blackAttacks = pos.isSquareAttacked(square, 'b');

      // White in Black's territory (ranks 5-8)
      if (rank >= 4 && whiteAttacks && !blackAttacks) {
        whiteSpaceInBlackTerritory++;
        whiteControlled.push(square);
      }

      // Black in White's territory (ranks 1-4)
      if (rank < 4 && blackAttacks && !whiteAttacks) {
        blackSpaceInWhiteTerritory++;
        blackControlled.push(square);
      }
    }
  }

  // Also count pawn space (pawns beyond 4th rank)
  const whitePawns = pos.getAllPieces().filter((p) => p.color === 'w' && p.type === 'p');
  const blackPawns = pos.getAllPieces().filter((p) => p.color === 'b' && p.type === 'p');

  const whiteAdvancedPawns = whitePawns.filter((p) => rankIndex(p.square) >= 5);
  const blackAdvancedPawns = blackPawns.filter((p) => rankIndex(p.square) <= 4);

  // Each advanced pawn adds to space
  whiteSpaceInBlackTerritory += whiteAdvancedPawns.length * 2;
  blackSpaceInWhiteTerritory += blackAdvancedPawns.length * 2;

  // Significant space advantage: 5+ squares more
  const spaceDiff = whiteSpaceInBlackTerritory - blackSpaceInWhiteTerritory;

  if (spaceDiff >= 5) {
    themes.push({
      id: 'space_advantage',
      category: 'positional',
      confidence: spaceDiff >= 8 ? 'high' : 'medium',
      severity: spaceDiff >= 10 ? 'significant' : 'minor',
      squares: whiteControlled.slice(0, 8),
      pieces: [],
      beneficiary: 'w',
      explanation: `White has significant space advantage (+${spaceDiff} squares in enemy territory)`,
    });
  } else if (spaceDiff <= -5) {
    themes.push({
      id: 'space_advantage',
      category: 'positional',
      confidence: spaceDiff <= -8 ? 'high' : 'medium',
      severity: spaceDiff <= -10 ? 'significant' : 'minor',
      squares: blackControlled.slice(0, 8),
      pieces: [],
      beneficiary: 'b',
      explanation: `Black has significant space advantage (+${Math.abs(spaceDiff)} squares in enemy territory)`,
    });
  }

  return themes;
}

/**
 * Detect central control
 */
function detectCentralControl(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  // Score central control
  let whiteControl = 0;
  let blackControl = 0;
  const whiteSquares: string[] = [];
  const blackSquares: string[] = [];

  // Main center is worth more
  for (const square of CENTER_SQUARES) {
    const whiteAttacks = countAttackers(pos, square, 'w');
    const blackAttacks = countAttackers(pos, square, 'b');

    const piece = pos.getPiece(square);
    const occupancy = piece ? (piece.color === 'w' ? 2 : piece.color === 'b' ? -2 : 0) : 0;

    const control = whiteAttacks - blackAttacks + occupancy;

    if (control > 0) {
      whiteControl += control * 2; // Center squares weighted double
      whiteSquares.push(square);
    } else if (control < 0) {
      blackControl += Math.abs(control) * 2;
      blackSquares.push(square);
    }
  }

  // Extended center
  for (const square of EXTENDED_CENTER) {
    const whiteAttacks = countAttackers(pos, square, 'w');
    const blackAttacks = countAttackers(pos, square, 'b');

    const piece = pos.getPiece(square);
    const occupancy = piece ? (piece.color === 'w' ? 1 : piece.color === 'b' ? -1 : 0) : 0;

    const control = whiteAttacks - blackAttacks + occupancy;

    if (control > 0) {
      whiteControl += control;
      if (whiteSquares.length < 8) whiteSquares.push(square);
    } else if (control < 0) {
      blackControl += Math.abs(control);
      if (blackSquares.length < 8) blackSquares.push(square);
    }
  }

  const controlDiff = whiteControl - blackControl;

  if (controlDiff >= 4) {
    themes.push({
      id: 'central_control',
      category: 'positional',
      confidence: controlDiff >= 6 ? 'high' : 'medium',
      severity: controlDiff >= 8 ? 'significant' : 'minor',
      squares: whiteSquares,
      pieces: [],
      beneficiary: 'w',
      explanation: `White dominates the center`,
    });
  } else if (controlDiff <= -4) {
    themes.push({
      id: 'central_control',
      category: 'positional',
      confidence: controlDiff <= -6 ? 'high' : 'medium',
      severity: controlDiff <= -8 ? 'significant' : 'minor',
      squares: blackSquares,
      pieces: [],
      beneficiary: 'b',
      explanation: `Black dominates the center`,
    });
  }

  return themes;
}

/**
 * Count attackers of a square
 */
function countAttackers(pos: ChessPosition, square: string, color: Color): number {
  return pos.getAttackers(square, color).length;
}

/**
 * Detect convergence zones - areas where multiple pieces focus
 */
function detectConvergenceZones(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  // Check key areas for piece convergence
  const zones = [
    { name: 'kingside', squares: ['f6', 'g6', 'h6', 'f7', 'g7', 'h7'], against: 'b' },
    { name: 'kingside', squares: ['f3', 'g3', 'h3', 'f2', 'g2', 'h2'], against: 'w' },
    { name: 'queenside', squares: ['a6', 'b6', 'c6', 'a7', 'b7', 'c7'], against: 'b' },
    { name: 'queenside', squares: ['a3', 'b3', 'c3', 'a2', 'b2', 'c2'], against: 'w' },
  ];

  for (const zone of zones) {
    const attackerColor = zone.against === 'w' ? 'b' : 'w';
    let totalAttackers = 0;
    const attackedSquares: string[] = [];

    for (const square of zone.squares) {
      const attackers = pos.getAttackers(square, attackerColor);
      if (attackers.length >= 2) {
        totalAttackers += attackers.length;
        attackedSquares.push(square);
      }
    }

    // Need significant convergence
    if (totalAttackers >= 6 && attackedSquares.length >= 3) {
      themes.push({
        id: 'convergence_zone',
        category: 'positional',
        confidence: totalAttackers >= 8 ? 'high' : 'medium',
        severity: 'significant',
        squares: attackedSquares,
        pieces: [],
        beneficiary: attackerColor,
        explanation: `${attackerColor === 'w' ? 'White' : 'Black'} pieces converge on ${zone.against === 'w' ? "White's" : "Black's"} ${zone.name}`,
      });
    }
  }

  return themes;
}
