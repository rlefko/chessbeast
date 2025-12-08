/**
 * Outpost Detection
 *
 * Detects outpost-related positional themes:
 * - Outpost: Square protected by pawn that enemy pawns can't attack
 * - Power outpost: Outpost occupied by a knight or bishop
 * - Pseudo outpost: Potential outpost not yet established
 * - Weak squares: Holes in the pawn structure
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color } from '../types.js';
import { pieceName } from '../utils/piece-utils.js';
import { fileIndex, rankIndex, getAdjacentFiles } from '../utils/square-utils.js';

/**
 * Detect all outpost-related themes
 */
export function detectOutposts(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  for (const color of ['w', 'b'] as Color[]) {
    themes.push(...detectOutpostsForColor(pos, color));
    themes.push(...detectWeakSquares(pos, color));
  }

  return themes;
}

/**
 * Detect outposts for a specific color
 */
function detectOutpostsForColor(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = color === 'w' ? 'b' : 'w';

  // Get enemy pawn positions to determine which squares they can never attack
  const enemyPawns = pos.getAllPieces().filter((p) => p.color === enemyColor && p.type === 'p');
  const ourPawns = pos.getAllPieces().filter((p) => p.color === color && p.type === 'p');

  // Outpost squares must be in enemy territory
  const outpostRanks = color === 'w' ? [4, 5, 6] : [3, 4, 5];

  // Check each square for outpost potential
  for (let file = 0; file < 8; file++) {
    for (const rank of outpostRanks) {
      const square = String.fromCharCode(97 + file) + rank;
      const adjacentFiles = getAdjacentFiles(file);

      // Check if enemy pawns can ever attack this square
      const canBeAttackedByPawn = enemyPawns.some((pawn) => {
        const pawnFile = fileIndex(pawn.square);
        const pawnRank = rankIndex(pawn.square);

        // Pawn must be on adjacent file
        if (!adjacentFiles.includes(pawnFile)) return false;

        // Pawn must be able to reach attacking position
        if (color === 'w') {
          // For white outposts, black pawns attack from higher ranks
          return pawnRank > rank;
        } else {
          // For black outposts, white pawns attack from lower ranks
          return pawnRank < rank;
        }
      });

      if (canBeAttackedByPawn) continue;

      // Check if we have a pawn supporting this square
      const isSupported = ourPawns.some((pawn) => {
        const pawnFile = fileIndex(pawn.square);
        const pawnRank = rankIndex(pawn.square);

        if (!adjacentFiles.includes(pawnFile)) return false;

        // Our pawn supports from behind
        if (color === 'w') {
          return pawnRank === rank - 1;
        } else {
          return pawnRank === rank + 1;
        }
      });

      // Check what's currently on the square
      const pieceOnSquare = pos.getPiece(square);

      if (pieceOnSquare && pieceOnSquare.color === color) {
        // Power outpost - we have a piece there
        if (pieceOnSquare.type === 'n' || pieceOnSquare.type === 'b') {
          themes.push({
            id: 'power_outpost',
            category: 'positional',
            confidence: 'high',
            severity: isSupported ? 'significant' : 'minor',
            squares: [square],
            pieces: [`${pieceOnSquare.type.toUpperCase()}${square}`],
            beneficiary: color,
            explanation: `${pieceName(pieceOnSquare.type)} on ${square} occupies a ${isSupported ? 'protected ' : ''}outpost`,
          });
        }
      } else if (isSupported) {
        // Empty supported outpost
        themes.push({
          id: 'outpost',
          category: 'positional',
          confidence: 'high',
          severity: 'minor',
          squares: [square],
          pieces: [],
          beneficiary: color,
          explanation: `Outpost square on ${square} available for piece placement`,
        });
      } else {
        // Potential outpost (could be supported in the future)
        const canBeSupported = ourPawns.some((pawn) => {
          const pawnFile = fileIndex(pawn.square);
          const pawnRank = rankIndex(pawn.square);

          if (!adjacentFiles.includes(pawnFile)) return false;

          // Could advance to support
          if (color === 'w') {
            return pawnRank < rank - 1 && pawnRank >= 2;
          } else {
            return pawnRank > rank + 1 && pawnRank <= 7;
          }
        });

        if (canBeSupported) {
          themes.push({
            id: 'pseudo_outpost',
            category: 'positional',
            confidence: 'low',
            severity: 'minor',
            squares: [square],
            pieces: [],
            beneficiary: color,
            explanation: `Potential outpost on ${square} could be established`,
          });
        }
      }
    }
  }

  return themes;
}

/**
 * Detect weak squares (holes in pawn structure)
 */
function detectWeakSquares(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = color === 'w' ? 'b' : 'w';
  const ourPawns = pos.getAllPieces().filter((p) => p.color === color && p.type === 'p');

  // Key squares to check (central and near-central)
  const keySquares =
    color === 'w'
      ? ['c3', 'd3', 'e3', 'f3', 'c4', 'd4', 'e4', 'f4']
      : ['c6', 'd6', 'e6', 'f6', 'c5', 'd5', 'e5', 'f5'];

  for (const square of keySquares) {
    const file = fileIndex(square);
    const rank = rankIndex(square);
    const adjacentFiles = getAdjacentFiles(file);

    // Check if any of our pawns can defend this square
    const canDefend = ourPawns.some((pawn) => {
      const pawnFile = fileIndex(pawn.square);
      const pawnRank = rankIndex(pawn.square);

      if (!adjacentFiles.includes(pawnFile)) return false;

      // Pawn defends from behind
      if (color === 'w') {
        return pawnRank === rank - 1;
      } else {
        return pawnRank === rank + 1;
      }
    });

    // Check if any pawn could advance to defend
    const couldDefend = ourPawns.some((pawn) => {
      const pawnFile = fileIndex(pawn.square);
      const pawnRank = rankIndex(pawn.square);

      if (!adjacentFiles.includes(pawnFile)) return false;

      // Could reach defending position
      if (color === 'w') {
        return pawnRank < rank - 1;
      } else {
        return pawnRank > rank + 1;
      }
    });

    if (!canDefend && !couldDefend) {
      // Permanent weak square
      themes.push({
        id: 'weak_square',
        category: 'positional',
        confidence: 'high',
        severity: square.includes('4') || square.includes('5') ? 'significant' : 'minor',
        squares: [square],
        pieces: [],
        beneficiary: enemyColor,
        explanation: `${square} is a permanent weakness that cannot be defended by pawns`,
      });
    }
  }

  return themes;
}

/**
 * Detect entry squares (squares that give access to weak areas)
 */
export function detectEntrySquares(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  for (const color of ['w', 'b'] as Color[]) {
    themes.push(...detectEntrySquaresForColor(pos, color));
  }

  return themes;
}

/**
 * Detect entry squares for rooks and queens
 */
function detectEntrySquaresForColor(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = color === 'w' ? 'b' : 'w';

  // Entry ranks (7th/2nd rank squares)
  const entryRank = color === 'w' ? 7 : 2;

  // Check each file for entry potential
  for (let file = 0; file < 8; file++) {
    const square = String.fromCharCode(97 + file) + entryRank;
    const pieceOnSquare = pos.getPiece(square);

    // Square should be empty or occupable
    if (pieceOnSquare && pieceOnSquare.color === enemyColor) continue;

    // Check if we can reach this square with a major piece
    const ourMajorPieces = pos
      .getAllPieces()
      .filter((p) => p.color === color && (p.type === 'r' || p.type === 'q'));

    for (const piece of ourMajorPieces) {
      // Check if piece attacks this square
      const attackers = pos.getAttackers(square, color);
      if (attackers.includes(piece.square)) {
        // Check if it's not heavily defended
        const defenders = pos.getAttackers(square, enemyColor);

        if (defenders.length <= 1) {
          themes.push({
            id: 'entry_square',
            category: 'positional',
            confidence: 'medium',
            severity: 'minor',
            squares: [square, piece.square],
            pieces: [`${piece.type.toUpperCase()}${piece.square}`],
            beneficiary: color,
            explanation: `${pieceName(piece.type)} can infiltrate via ${square}`,
          });
          break; // Only report once per square
        }
      }
    }
  }

  return themes;
}
