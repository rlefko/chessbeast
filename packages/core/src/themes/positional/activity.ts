/**
 * Piece Activity Detection
 *
 * Detects activity-related positional themes:
 * - Development lead: More pieces developed
 * - Activity advantage: Pieces have more scope
 * - Piece passivity: Poorly placed pieces
 * - Paralysis: Pieces with no good moves
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color } from '../types.js';
import { pieceName } from '../utils/piece-utils.js';
import { rankIndex, fileIndex } from '../utils/square-utils.js';

/**
 * Detect all activity-related themes
 */
export function detectActivityThemes(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  themes.push(...detectDevelopmentLead(pos));
  themes.push(...detectActivityAdvantage(pos));
  themes.push(...detectPiecePassivity(pos));

  return themes;
}

/**
 * Detect development lead
 * Compare pieces that have moved from starting squares
 */
function detectDevelopmentLead(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  const whiteDevelopment = calculateDevelopment(pos, 'w');
  const blackDevelopment = calculateDevelopment(pos, 'b');

  const devDiff = whiteDevelopment.score - blackDevelopment.score;

  if (devDiff >= 3) {
    themes.push({
      id: 'development_lead',
      category: 'positional',
      confidence: devDiff >= 4 ? 'high' : 'medium',
      severity: devDiff >= 5 ? 'significant' : 'minor',
      squares: whiteDevelopment.developed,
      pieces: whiteDevelopment.pieces,
      beneficiary: 'w',
      explanation: `White has a significant development lead (${whiteDevelopment.count} vs ${blackDevelopment.count} pieces developed)`,
    });
  } else if (devDiff <= -3) {
    themes.push({
      id: 'development_lead',
      category: 'positional',
      confidence: devDiff <= -4 ? 'high' : 'medium',
      severity: devDiff <= -5 ? 'significant' : 'minor',
      squares: blackDevelopment.developed,
      pieces: blackDevelopment.pieces,
      beneficiary: 'b',
      explanation: `Black has a significant development lead (${blackDevelopment.count} vs ${whiteDevelopment.count} pieces developed)`,
    });
  }

  return themes;
}

/**
 * Calculate development score for a color
 */
function calculateDevelopment(
  pos: ChessPosition,
  color: Color,
): { score: number; count: number; developed: string[]; pieces: string[] } {
  const pieces = pos.getAllPieces().filter((p) => p.color === color);

  let score = 0;
  let count = 0;
  const developed: string[] = [];
  const developedPieces: string[] = [];

  // Starting squares for pieces
  const knightStarts = color === 'w' ? ['b1', 'g1'] : ['b8', 'g8'];
  const bishopStarts = color === 'w' ? ['c1', 'f1'] : ['c8', 'f8'];
  const rookStarts = color === 'w' ? ['a1', 'h1'] : ['a8', 'h8'];
  const queenStart = color === 'w' ? 'd1' : 'd8';
  const kingStart = color === 'w' ? 'e1' : 'e8';

  for (const piece of pieces) {
    switch (piece.type) {
      case 'n':
        if (!knightStarts.includes(piece.square)) {
          score += 1;
          count++;
          developed.push(piece.square);
          developedPieces.push(`N${piece.square}`);
        }
        break;
      case 'b':
        if (!bishopStarts.includes(piece.square)) {
          score += 1;
          count++;
          developed.push(piece.square);
          developedPieces.push(`B${piece.square}`);
        }
        break;
      case 'r':
        // Rooks developed if connected or on open file
        if (!rookStarts.includes(piece.square)) {
          score += 0.5;
          count++;
          developed.push(piece.square);
          developedPieces.push(`R${piece.square}`);
        }
        break;
      case 'q':
        // Queen development is less valuable early
        if (piece.square !== queenStart) {
          score += 0.3; // Small bonus - early queen development can be risky
        }
        break;
      case 'k':
        // Castled king is developed
        if (piece.square !== kingStart) {
          const castled =
            color === 'w'
              ? piece.square === 'g1' || piece.square === 'c1'
              : piece.square === 'g8' || piece.square === 'c8';
          if (castled) {
            score += 1;
          }
        }
        break;
    }
  }

  return { score, count, developed, pieces: developedPieces };
}

/**
 * Detect activity advantage
 * Compare piece mobility and square control
 */
function detectActivityAdvantage(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  const whiteActivity = calculateActivity(pos, 'w');
  const blackActivity = calculateActivity(pos, 'b');

  const activityDiff = whiteActivity.score - blackActivity.score;

  if (activityDiff >= 5) {
    themes.push({
      id: 'activity_advantage',
      category: 'positional',
      confidence: activityDiff >= 8 ? 'high' : 'medium',
      severity: activityDiff >= 10 ? 'significant' : 'minor',
      squares: whiteActivity.activeSquares.slice(0, 6),
      pieces: whiteActivity.activePieces,
      beneficiary: 'w',
      explanation: `White's pieces are more active`,
    });
  } else if (activityDiff <= -5) {
    themes.push({
      id: 'activity_advantage',
      category: 'positional',
      confidence: activityDiff <= -8 ? 'high' : 'medium',
      severity: activityDiff <= -10 ? 'significant' : 'minor',
      squares: blackActivity.activeSquares.slice(0, 6),
      pieces: blackActivity.activePieces,
      beneficiary: 'b',
      explanation: `Black's pieces are more active`,
    });
  }

  return themes;
}

/**
 * Calculate piece activity score
 */
function calculateActivity(
  pos: ChessPosition,
  color: Color,
): { score: number; activeSquares: string[]; activePieces: string[] } {
  const pieces = pos.getAllPieces().filter((p) => p.color === color);
  let score = 0;
  const activeSquares: string[] = [];
  const activePieces: string[] = [];

  for (const piece of pieces) {
    if (piece.type === 'p' || piece.type === 'k') continue;

    // Count squares this piece attacks
    const attacks = countPieceAttacks(pos, piece.square, piece.type, color);

    // Weight by piece type and attack quality
    let pieceScore = 0;

    switch (piece.type) {
      case 'n':
        // Knights: central squares worth more
        pieceScore = attacks * 0.5;
        break;
      case 'b':
        // Bishops: long diagonals matter
        pieceScore = attacks * 0.4;
        break;
      case 'r': {
        // Rooks: open files and 7th rank
        pieceScore = attacks * 0.3;
        const onSeventhRank =
          color === 'w' ? rankIndex(piece.square) === 7 : rankIndex(piece.square) === 2;
        if (onSeventhRank) pieceScore += 2;
        break;
      }
      case 'q':
        // Queen: mobility matters
        pieceScore = attacks * 0.2;
        break;
    }

    score += pieceScore;

    if (pieceScore > 1) {
      activePieces.push(`${piece.type.toUpperCase()}${piece.square}`);
      activeSquares.push(piece.square);
    }
  }

  return { score, activeSquares, activePieces };
}

/**
 * Count squares a piece attacks
 */
function countPieceAttacks(
  pos: ChessPosition,
  square: string,
  _pieceType: string,
  _color: Color,
): number {
  // Simplified: count legal moves from this square
  const legalMoves = pos.getLegalMoves();
  return legalMoves.filter((m) => m.length >= 4 && m.substring(0, 2) === square).length;
}

/**
 * Detect passive pieces
 * Pieces that are badly placed or restricted
 */
function detectPiecePassivity(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  for (const color of ['w', 'b'] as Color[]) {
    themes.push(...detectPassivePiecesForColor(pos, color));
  }

  return themes;
}

/**
 * Detect passive pieces for a color
 */
function detectPassivePiecesForColor(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = color === 'w' ? 'b' : 'w';
  const pieces = pos.getAllPieces().filter((p) => p.color === color);

  for (const piece of pieces) {
    if (piece.type === 'p' || piece.type === 'k') continue;

    const legalMoves = pos.getLegalMoves();
    const pieceMoves = legalMoves.filter(
      (m) => m.length >= 4 && m.substring(0, 2) === piece.square,
    );

    // Check for bad bishop
    if (piece.type === 'b') {
      const isBadBishop = checkBadBishop(pos, piece.square, color);
      if (isBadBishop) {
        themes.push({
          id: 'piece_passivity',
          category: 'positional',
          confidence: 'medium',
          severity: 'minor',
          squares: [piece.square],
          pieces: [`B${piece.square}`],
          beneficiary: enemyColor,
          explanation: `Bad bishop on ${piece.square} blocked by own pawns`,
        });
      }
    }

    // Check for trapped or very restricted pieces
    if (pieceMoves.length <= 1 && piece.type !== 'r') {
      // Might be trapped or very passive
      themes.push({
        id: piece.type === 'n' || piece.type === 'b' ? 'piece_passivity' : 'paralysis',
        category: 'positional',
        confidence: pieceMoves.length === 0 ? 'high' : 'medium',
        severity: pieceMoves.length === 0 ? 'significant' : 'minor',
        squares: [piece.square],
        pieces: [`${piece.type.toUpperCase()}${piece.square}`],
        beneficiary: enemyColor,
        explanation: `${pieceName(piece.type)} on ${piece.square} has ${pieceMoves.length === 0 ? 'no' : 'very limited'} mobility`,
      });
    }
  }

  return themes;
}

/**
 * Check if a bishop is "bad" (blocked by own pawns)
 */
function checkBadBishop(pos: ChessPosition, bishopSquare: string, color: Color): boolean {
  const ourPawns = pos.getAllPieces().filter((p) => p.color === color && p.type === 'p');

  // Determine if bishop is on light or dark square
  const bishopFile = fileIndex(bishopSquare);
  const bishopRank = rankIndex(bishopSquare);
  const isLightSquare = (bishopFile + bishopRank) % 2 === 1;

  // Count own pawns on same color squares
  let blockedByPawns = 0;
  let totalCenterPawns = 0;

  for (const pawn of ourPawns) {
    const pawnFile = fileIndex(pawn.square);
    const pawnRank = rankIndex(pawn.square);
    const pawnOnLight = (pawnFile + pawnRank) % 2 === 1;

    if (pawnOnLight === isLightSquare) {
      blockedByPawns++;
      // Central pawns matter more
      if (pawnFile >= 2 && pawnFile <= 5) {
        totalCenterPawns++;
      }
    }
  }

  // Bad bishop if 3+ pawns on same color, especially central pawns
  return blockedByPawns >= 3 && totalCenterPawns >= 2;
}
