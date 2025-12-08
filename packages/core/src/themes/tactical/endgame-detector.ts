/**
 * Endgame Theme Detection
 *
 * Detects endgame-specific tactical themes:
 * - Opposition: Kings facing each other with odd squares between
 * - Triangulation: King maneuver to lose a tempo
 * - Zugzwang: Any move worsens position
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color } from '../types.js';
import { findKing, getPieceValue } from '../utils/piece-utils.js';
import { fileIndex, rankIndex, getKingDistance } from '../utils/square-utils.js';

/**
 * Detect all endgame themes in the position
 */
export function detectEndgameThemes(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  // Only detect endgame themes if position is an endgame
  if (!isEndgame(pos)) {
    return themes;
  }

  const opposition = detectOpposition(pos);
  if (opposition) themes.push(opposition);

  const triangulation = detectTriangulation(pos);
  if (triangulation) themes.push(triangulation);

  const zugzwang = detectZugzwang(pos);
  if (zugzwang) themes.push(zugzwang);

  return themes;
}

/**
 * Check if position is an endgame
 * Endgame: No queens, or queen + at most one minor piece per side
 */
function isEndgame(pos: ChessPosition): boolean {
  const pieces = pos.getAllPieces();

  let whiteQueens = 0;
  let blackQueens = 0;
  let whiteMaterial = 0;
  let blackMaterial = 0;

  for (const piece of pieces) {
    const value = getPieceValue(piece.type);
    if (piece.type === 'q') {
      if (piece.color === 'w') whiteQueens++;
      else blackQueens++;
    }
    if (piece.type !== 'k' && piece.type !== 'p') {
      if (piece.color === 'w') whiteMaterial += value;
      else blackMaterial += value;
    }
  }

  // No queens = endgame
  if (whiteQueens === 0 && blackQueens === 0) {
    return true;
  }

  // Queens but very low material = endgame
  if (whiteMaterial <= 1200 && blackMaterial <= 1200) {
    return true;
  }

  return false;
}

/**
 * Detect opposition between kings
 *
 * Direct opposition: Kings on same file/rank, 1 square apart
 * Distant opposition: Kings on same file/rank, odd number of squares apart
 * Diagonal opposition: Kings on same diagonal, odd squares apart
 */
function detectOpposition(pos: ChessPosition): DetectedTheme | null {
  const whiteKing = findKing(pos, 'w');
  const blackKing = findKing(pos, 'b');

  if (!whiteKing || !blackKing) return null;

  const wFile = fileIndex(whiteKing);
  const wRank = rankIndex(whiteKing);
  const bFile = fileIndex(blackKing);
  const bRank = rankIndex(blackKing);

  const fileDiff = Math.abs(wFile - bFile);
  const rankDiff = Math.abs(wRank - bRank);

  // Direct opposition on file (vertical)
  if (fileDiff === 0 && rankDiff === 2) {
    return createOppositionTheme(whiteKing, blackKing, 'direct vertical', pos);
  }

  // Direct opposition on rank (horizontal)
  if (rankDiff === 0 && fileDiff === 2) {
    return createOppositionTheme(whiteKing, blackKing, 'direct horizontal', pos);
  }

  // Distant opposition on file
  if (fileDiff === 0 && rankDiff > 2 && rankDiff % 2 === 0) {
    return createOppositionTheme(whiteKing, blackKing, 'distant vertical', pos);
  }

  // Distant opposition on rank
  if (rankDiff === 0 && fileDiff > 2 && fileDiff % 2 === 0) {
    return createOppositionTheme(whiteKing, blackKing, 'distant horizontal', pos);
  }

  // Diagonal opposition
  if (fileDiff === rankDiff && fileDiff % 2 === 0 && fileDiff > 0) {
    return createOppositionTheme(whiteKing, blackKing, 'diagonal', pos);
  }

  return null;
}

/**
 * Create opposition theme
 */
function createOppositionTheme(
  whiteKing: string,
  blackKing: string,
  type: string,
  pos: ChessPosition,
): DetectedTheme {
  // The side NOT to move has the opposition
  const sideToMove = pos.turn();
  const hasOpposition = sideToMove === 'w' ? 'b' : 'w';

  return {
    id: 'opposition',
    category: 'tactical',
    confidence: 'high',
    severity: 'significant',
    squares: [whiteKing, blackKing],
    pieces: [`K${whiteKing}`, `k${blackKing}`],
    beneficiary: hasOpposition,
    explanation: `${hasOpposition === 'w' ? 'White' : 'Black'} has the ${type} opposition`,
    materialAtStake: 0,
  };
}

/**
 * Detect triangulation potential
 *
 * Triangulation: King can reach the same square in more moves than opponent,
 * allowing them to lose a tempo and gain opposition.
 */
function detectTriangulation(pos: ChessPosition): DetectedTheme | null {
  const whiteKing = findKing(pos, 'w');
  const blackKing = findKing(pos, 'b');

  if (!whiteKing || !blackKing) return null;

  // Count pieces - triangulation mainly in pure king+pawn endgames
  const pieces = pos.getAllPieces();
  const nonPawnPieces = pieces.filter((p) => p.type !== 'k' && p.type !== 'p');

  // Only detect in simple endgames
  if (nonPawnPieces.length > 2) return null;

  // Check for triangulation squares - adjacent empty squares the king could use
  const sideToMove = pos.turn();
  const friendlyKing = sideToMove === 'w' ? whiteKing : blackKing;

  const kingFile = fileIndex(friendlyKing);
  const kingRank = rankIndex(friendlyKing);

  // Look for triangulation pattern: king has multiple routes to same square
  const triangulationSquares: string[] = [];

  // Check adjacent squares
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;

      const newFile = kingFile + df;
      const newRank = kingRank + dr;

      if (newFile >= 0 && newFile <= 7 && newRank >= 0 && newRank <= 7) {
        const square = String.fromCharCode(97 + newFile) + (newRank + 1);
        const piece = pos.getPiece(square);

        if (!piece) {
          // Check if this square is safe (not attacked by enemy king)
          const enemyKing = sideToMove === 'w' ? blackKing : whiteKing;
          if (getKingDistance(square, enemyKing) > 1) {
            triangulationSquares.push(square);
          }
        }
      }
    }
  }

  // Need at least 3 adjacent safe squares for triangulation
  if (triangulationSquares.length >= 3) {
    return {
      id: 'triangulation',
      category: 'tactical',
      confidence: 'medium',
      severity: 'minor',
      squares: [friendlyKing, ...triangulationSquares.slice(0, 3)],
      pieces: [`K${friendlyKing}`],
      beneficiary: sideToMove,
      explanation: `${sideToMove === 'w' ? 'White' : 'Black'} king can triangulate`,
      materialAtStake: 0,
    };
  }

  return null;
}

/**
 * Detect zugzwang
 *
 * Zugzwang: The side to move would prefer to pass but cannot.
 * Every move worsens their position.
 */
function detectZugzwang(pos: ChessPosition): DetectedTheme | null {
  const sideToMove = pos.turn();
  const enemyColor: Color = sideToMove === 'w' ? 'b' : 'w';

  // Get legal moves
  const legalMoves = pos.getLegalMoves();

  if (legalMoves.length === 0) {
    // No legal moves - checkmate or stalemate, not zugzwang
    return null;
  }

  // Count pieces - zugzwang mainly in simple endgames
  const pieces = pos.getAllPieces();
  const friendlyPieces = pieces.filter((p) => p.color === sideToMove);
  const enemyPieces = pieces.filter((p) => p.color === enemyColor);

  // Filter out kings
  const friendlyNonKing = friendlyPieces.filter((p) => p.type !== 'k');
  const enemyNonKing = enemyPieces.filter((p) => p.type !== 'k');

  // Zugzwang typically in simple endgames
  if (friendlyNonKing.length > 4 || enemyNonKing.length > 4) {
    return null;
  }

  // Check for common zugzwang patterns

  // Pattern 1: Only pawn moves available, and they all lose the pawn
  const pawnMoves = legalMoves.filter((move) => {
    const from = move.substring(0, 2);
    const piece = pos.getPiece(from);
    return piece && piece.type === 'p';
  });

  const kingMoves = legalMoves.filter((move) => {
    const from = move.substring(0, 2);
    const piece = pos.getPiece(from);
    return piece && piece.type === 'k';
  });

  // If only king moves, check if they all lose ground
  if (pawnMoves.length === 0 && kingMoves.length > 0) {
    const friendlyKing = findKing(pos, sideToMove);
    const enemyKing = findKing(pos, enemyColor);

    if (friendlyKing && enemyKing) {
      // Check if king is blocked from advancing
      const friendlyRank = rankIndex(friendlyKing);

      // For white trying to advance (going up), check if blocked
      // For black trying to advance (going down), check if blocked
      let canAdvance = false;
      for (const move of kingMoves) {
        const toSquare = move.substring(2, 4);
        const toRank = rankIndex(toSquare);
        if (
          (sideToMove === 'w' && toRank >= friendlyRank) ||
          (sideToMove === 'b' && toRank <= friendlyRank)
        ) {
          canAdvance = true;
          break;
        }
      }

      if (!canAdvance) {
        // King cannot advance - potential zugzwang
        return {
          id: 'zugzwang',
          category: 'tactical',
          confidence: 'medium',
          severity: 'critical',
          squares: [friendlyKing],
          pieces: [`K${friendlyKing}`],
          beneficiary: enemyColor,
          explanation: `${sideToMove === 'w' ? 'White' : 'Black'} is in zugzwang - any move worsens position`,
          materialAtStake: 0,
        };
      }
    }
  }

  // Pattern 2: Pawn endgame where all pawn moves lose
  if (friendlyNonKing.every((p) => p.type === 'p') && friendlyNonKing.length > 0) {
    let allPawnMovesBad = true;

    for (const move of pawnMoves) {
      const to = move.substring(2, 4);
      // Check if pawn move exposes pawn to capture
      const cloned = pos.clone();
      try {
        cloned.move(move);
        // Check if pawn is still safe
        if (!cloned.isSquareAttacked(to, enemyColor)) {
          allPawnMovesBad = false;
          break;
        }
      } catch {
        // Invalid move
      }
    }

    if (allPawnMovesBad && pawnMoves.length > 0) {
      return {
        id: 'zugzwang',
        category: 'tactical',
        confidence: 'low',
        severity: 'significant',
        squares: [],
        pieces: [],
        beneficiary: enemyColor,
        explanation: `${sideToMove === 'w' ? 'White' : 'Black'} is in zugzwang - pawn moves all weaken position`,
        materialAtStake: 100,
      };
    }
  }

  return null;
}
