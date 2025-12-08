/**
 * Color Complex Detection
 *
 * Detects color weakness themes:
 * - Color weakness: Weak squares of one color (especially without bishop)
 * - Opposite color bishops: Strategic implications
 * - Fortress potential: Defensive setups
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color } from '../types.js';
import { fileIndex, rankIndex, isLightSquare } from '../utils/square-utils.js';

/**
 * Detect all color complex themes
 */
export function detectColorThemes(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  themes.push(...detectColorWeakness(pos));
  themes.push(...detectOppositeColorBishops(pos));
  themes.push(...detectFortress(pos));

  return themes;
}

/**
 * Detect color weakness
 * Missing bishop + weak squares of that color
 */
function detectColorWeakness(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  for (const color of ['w', 'b'] as Color[]) {
    themes.push(...detectColorWeaknessForColor(pos, color));
  }

  return themes;
}

/**
 * Detect color weakness for a specific color
 */
function detectColorWeaknessForColor(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = color === 'w' ? 'b' : 'w';

  const bishops = pos.getAllPieces().filter((p) => p.color === color && p.type === 'b');
  const enemyBishops = pos.getAllPieces().filter((p) => p.color === enemyColor && p.type === 'b');

  // Check if we're missing a bishop on one color
  if (bishops.length === 1) {
    const bishop = bishops[0]!;
    const bishopOnLight = isLightSquare(bishop.square);
    const weakColor = bishopOnLight ? 'dark' : 'light';

    // Find weak squares of the missing bishop's color
    const weakSquares: string[] = [];
    const keySquares = getKeySquares(color);

    for (const square of keySquares) {
      const squareIsLight = isLightSquare(square);
      if (squareIsLight !== bishopOnLight) {
        // This is a square our remaining bishop can't defend
        // Check if it's actually weak
        const ourDefenders = pos.getAttackers(square, color);
        const theirAttackers = pos.getAttackers(square, enemyColor);

        if (ourDefenders.length < theirAttackers.length) {
          weakSquares.push(square);
        }
      }
    }

    // Check if enemy has the opposite color bishop
    const enemyHasOpposite = enemyBishops.some((b) => isLightSquare(b.square) !== bishopOnLight);

    if (weakSquares.length >= 3) {
      themes.push({
        id: 'color_weakness',
        category: 'positional',
        confidence: weakSquares.length >= 4 ? 'high' : 'medium',
        severity: enemyHasOpposite ? 'significant' : 'minor',
        squares: weakSquares.slice(0, 6),
        pieces: [],
        beneficiary: enemyColor,
        explanation: `${color === 'w' ? 'White' : 'Black'} has weak ${weakColor} squares${enemyHasOpposite ? ' and opponent has the controlling bishop' : ''}`,
      });
    }
  }

  // Check if missing both bishops (very weak)
  if (bishops.length === 0) {
    const weakSquares = getKeySquares(color);
    themes.push({
      id: 'color_weakness',
      category: 'positional',
      confidence: 'high',
      severity: 'significant',
      squares: weakSquares.slice(0, 6),
      pieces: [],
      beneficiary: enemyColor,
      explanation: `${color === 'w' ? 'White' : 'Black'} has no bishops - vulnerable on both color complexes`,
    });
  }

  return themes;
}

/**
 * Get key squares in/near a color's territory
 */
function getKeySquares(color: Color): string[] {
  if (color === 'w') {
    return ['c3', 'd3', 'e3', 'f3', 'c4', 'd4', 'e4', 'f4', 'b2', 'g2'];
  } else {
    return ['c6', 'd6', 'e6', 'f6', 'c5', 'd5', 'e5', 'f5', 'b7', 'g7'];
  }
}

/**
 * Detect opposite color bishops situation
 */
function detectOppositeColorBishops(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  const whiteBishops = pos.getAllPieces().filter((p) => p.color === 'w' && p.type === 'b');
  const blackBishops = pos.getAllPieces().filter((p) => p.color === 'b' && p.type === 'b');

  // Need exactly one bishop each
  if (whiteBishops.length !== 1 || blackBishops.length !== 1) {
    return themes;
  }

  const whiteBishop = whiteBishops[0]!;
  const blackBishop = blackBishops[0]!;

  const whiteOnLight = isLightSquare(whiteBishop.square);
  const blackOnLight = isLightSquare(blackBishop.square);

  // Check for opposite colors
  if (whiteOnLight !== blackOnLight) {
    // Count material to assess drawish potential
    const whitePieces = pos.getAllPieces().filter((p) => p.color === 'w' && p.type !== 'k');
    const blackPieces = pos.getAllPieces().filter((p) => p.color === 'b' && p.type !== 'k');

    const isEndgame = whitePieces.length <= 5 && blackPieces.length <= 5;

    themes.push({
      id: 'fortress', // Using fortress as this often leads to drawish positions
      category: 'positional',
      confidence: 'high',
      severity: isEndgame ? 'significant' : 'minor',
      squares: [whiteBishop.square, blackBishop.square],
      pieces: [`B${whiteBishop.square}`, `B${blackBishop.square}`],
      beneficiary: 'w', // Neutral - benefits defender
      explanation: `Opposite color bishops${isEndgame ? ' - increased drawing chances' : ''}`,
    });
  }

  return themes;
}

/**
 * Detect fortress potential
 * Defensive setup that's hard to break through
 */
function detectFortress(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  for (const color of ['w', 'b'] as Color[]) {
    const fortress = detectFortressForColor(pos, color);
    if (fortress) {
      themes.push(fortress);
    }
  }

  return themes;
}

/**
 * Detect fortress for a specific color
 */
function detectFortressForColor(pos: ChessPosition, defenderColor: Color): DetectedTheme | null {
  const attackerColor = defenderColor === 'w' ? 'b' : 'w';

  // Check if we're significantly behind in material
  const ourPieces = pos.getAllPieces().filter((p) => p.color === defenderColor);
  const theirPieces = pos.getAllPieces().filter((p) => p.color === attackerColor);

  // Simple material count
  const getMaterialValue = (pieces: Array<{ type: string }>): number =>
    pieces.reduce((sum, p) => {
      const values: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1, k: 0 };
      return sum + (values[p.type] || 0);
    }, 0);

  const ourMaterial = getMaterialValue(ourPieces);
  const theirMaterial = getMaterialValue(theirPieces);

  // Only consider fortress if we're behind
  if (ourMaterial >= theirMaterial - 2) return null;

  // Check fortress conditions
  const ourPawns = ourPieces.filter((p) => p.type === 'p');
  const ourKing = ourPieces.find((p) => p.type === 'k');

  if (!ourKing) return null;

  const kingRank = rankIndex(ourKing.square);
  const kingFile = fileIndex(ourKing.square);

  // Check for blockaded position (pawns forming a wall)
  const isBlockaded = checkBlockade(pos, defenderColor);

  // Check for king in corner fortress
  const isCornerFortress = (kingFile <= 1 || kingFile >= 6) && (kingRank <= 2 || kingRank >= 7);

  // Check if our pieces are compact
  const isCompact = checkCompactDefense(pos, defenderColor);

  if (isBlockaded || (isCornerFortress && isCompact)) {
    const fortressSquares: string[] = [ourKing.square];
    for (const pawn of ourPawns) {
      fortressSquares.push(pawn.square);
    }

    return {
      id: 'fortress',
      category: 'positional',
      confidence: isBlockaded ? 'high' : 'medium',
      severity: 'significant',
      squares: fortressSquares.slice(0, 8),
      pieces: [],
      beneficiary: defenderColor,
      explanation: `${defenderColor === 'w' ? 'White' : 'Black'} has fortress potential despite material deficit`,
    };
  }

  return null;
}

/**
 * Check if position is blockaded
 */
function checkBlockade(pos: ChessPosition, defenderColor: Color): boolean {
  const ourPawns = pos.getAllPieces().filter((p) => p.color === defenderColor && p.type === 'p');

  let blockedPawns = 0;

  for (const pawn of ourPawns) {
    const file = fileIndex(pawn.square);
    const rank = rankIndex(pawn.square);
    const direction = defenderColor === 'w' ? 1 : -1;
    const frontSquare = String.fromCharCode(97 + file) + (rank + direction);

    // Check if pawn is blocked
    const blocker = pos.getPiece(frontSquare);
    if (blocker && blocker.type === 'p') {
      blockedPawns++;
    }
  }

  // Significant blockade if half or more pawns are blocked
  return blockedPawns >= Math.ceil(ourPawns.length / 2) && ourPawns.length >= 3;
}

/**
 * Check if defense is compact
 */
function checkCompactDefense(pos: ChessPosition, defenderColor: Color): boolean {
  const ourPieces = pos.getAllPieces().filter((p) => p.color === defenderColor);
  const king = ourPieces.find((p) => p.type === 'k');

  if (!king) return false;

  const kingFile = fileIndex(king.square);
  const kingRank = rankIndex(king.square);

  // Count pieces near king
  let nearbyPieces = 0;
  for (const piece of ourPieces) {
    if (piece.type === 'k') continue;
    const pieceFile = fileIndex(piece.square);
    const pieceRank = rankIndex(piece.square);

    const distance = Math.max(Math.abs(pieceFile - kingFile), Math.abs(pieceRank - kingRank));
    if (distance <= 2) {
      nearbyPieces++;
    }
  }

  // Compact if most pieces are near king
  return nearbyPieces >= (ourPieces.length - 1) * 0.6;
}
