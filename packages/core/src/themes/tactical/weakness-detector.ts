/**
 * Weakness Detection
 *
 * Detects various tactical weaknesses:
 * - Back rank weakness: King trapped on back rank
 * - f2/f7 weakness: Attacks on f2/f7 with king nearby
 * - Trapped piece: Piece with no safe moves
 * - Domination: Piece with no moves at all
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color, LocatedPiece } from '../types.js';
import {
  findKing,
  getPieceValue,
  pieceName,
  formatPieceAtSquare,
  isHangingPiece,
} from '../utils/piece-utils.js';
import { rankIndex, fileIndex } from '../utils/square-utils.js';

/**
 * Detect all weakness-related themes
 */
export function detectWeaknesses(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  for (const color of ['w', 'b'] as Color[]) {
    const backRank = detectBackRankWeakness(pos, color);
    if (backRank) themes.push(backRank);

    const f2f7 = detectF2F7Weakness(pos, color);
    if (f2f7) themes.push(f2f7);

    themes.push(...detectTrappedPieces(pos, color));
  }

  return themes;
}

/**
 * Detect back rank weakness
 * King on back rank with blocking pawns and enemy major pieces
 */
function detectBackRankWeakness(pos: ChessPosition, defenderColor: Color): DetectedTheme | null {
  const attackerColor = defenderColor === 'w' ? 'b' : 'w';
  const backRank = defenderColor === 'w' ? 1 : 8;
  const kingSquare = findKing(pos, defenderColor);

  if (!kingSquare || rankIndex(kingSquare) !== backRank) return null;

  const kingFile = fileIndex(kingSquare);

  // Check for blocking pawns
  const pawnRank = defenderColor === 'w' ? 2 : 7;
  let blockingPawns = 0;
  const checkSquares: string[] = [];

  // Check squares immediately in front of king (and adjacent files)
  for (let f = Math.max(0, kingFile - 1); f <= Math.min(7, kingFile + 1); f++) {
    const square = String.fromCharCode(97 + f) + pawnRank;
    const piece = pos.getPiece(square);

    if (piece && piece.type === 'p' && piece.color === defenderColor) {
      blockingPawns++;
      checkSquares.push(square);
    }
  }

  // Need at least 2 blocking pawns for significant weakness
  if (blockingPawns < 2) return null;

  // Check if enemy has major pieces (Q or R) that could exploit
  const enemyPieces = pos.getAllPieces().filter((p) => p.color === attackerColor);
  const majorPieces = enemyPieces.filter((p) => p.type === 'q' || p.type === 'r');

  if (majorPieces.length === 0) return null;

  // Check if back rank is actually vulnerable (can major pieces reach it?)
  const backRankSquares = 'abcdefgh'.split('').map((f) => f + backRank);
  const attackedBackRank = backRankSquares.filter((sq) => pos.isSquareAttacked(sq, attackerColor));

  if (attackedBackRank.length === 0) {
    // Potential weakness (not yet attacked)
    return {
      id: 'back_rank_weakness',
      category: 'tactical',
      confidence: 'medium',
      severity: 'significant',
      squares: [kingSquare, ...checkSquares],
      pieces: [`K${kingSquare}`],
      beneficiary: attackerColor,
      explanation: `Back rank is weak with king trapped behind pawns`,
      materialAtStake: 0,
    };
  }

  // Active back rank threat
  return {
    id: 'back_rank_weakness',
    category: 'tactical',
    confidence: 'high',
    severity: 'critical',
    squares: [kingSquare, ...attackedBackRank],
    pieces: [`K${kingSquare}`],
    beneficiary: attackerColor,
    explanation: `Back rank is under attack with king trapped`,
    materialAtStake: 0,
  };
}

/**
 * Detect f2/f7 weakness
 * These squares are weak early when only defended by king
 */
function detectF2F7Weakness(pos: ChessPosition, defenderColor: Color): DetectedTheme | null {
  const attackerColor = defenderColor === 'w' ? 'b' : 'w';
  const weakSquare = defenderColor === 'w' ? 'f2' : 'f7';
  const kingSquare = findKing(pos, defenderColor);

  if (!kingSquare) return null;

  // Check if king is near f2/f7
  const kingFile = fileIndex(kingSquare);
  const kingRank = rankIndex(kingSquare);
  const weakFile = 5; // 'f' = index 5
  const weakRank = defenderColor === 'w' ? 2 : 7;

  const kingNearby = Math.abs(kingFile - weakFile) <= 2 && Math.abs(kingRank - weakRank) <= 2;
  if (!kingNearby) return null;

  // Check current state of the weak square
  const pieceOnSquare = pos.getPiece(weakSquare);
  const isAttacked = pos.isSquareAttacked(weakSquare, attackerColor);

  // Count defenders
  const defenders = pos.getAttackers(weakSquare, defenderColor);
  const attackers = pos.getAttackers(weakSquare, attackerColor);

  // Weakness exists if attacked and under-defended
  if (isAttacked && attackers.length > defenders.length) {
    return {
      id: 'f2_f7_weakness',
      category: 'tactical',
      confidence: 'high',
      severity: pieceOnSquare ? 'critical' : 'significant',
      squares: [weakSquare, ...attackers],
      pieces: pieceOnSquare ? [formatPieceAtSquare({ ...pieceOnSquare, square: weakSquare })] : [],
      beneficiary: attackerColor,
      explanation: `${weakSquare} is under attack and insufficiently defended`,
      materialAtStake: pieceOnSquare ? getPieceValue(pieceOnSquare.type) : 0,
    };
  }

  // Potential weakness (undefended or weakly defended near king)
  if (defenders.length <= 1 && kingNearby) {
    const enemyPieces = pos.getAllPieces().filter((p) => p.color === attackerColor);
    const canAttack = enemyPieces.some(
      (p) => (p.type === 'b' || p.type === 'n' || p.type === 'q') && getPieceValue(p.type) > 0,
    );

    if (canAttack) {
      return {
        id: 'f2_f7_weakness',
        category: 'tactical',
        confidence: 'low',
        severity: 'minor',
        squares: [weakSquare],
        pieces: [],
        beneficiary: attackerColor,
        explanation: `${weakSquare} is potentially weak near the king`,
        materialAtStake: 0,
      };
    }
  }

  return null;
}

/**
 * Detect trapped pieces
 * A piece is trapped if all its moves result in losing it
 */
function detectTrappedPieces(pos: ChessPosition, pieceColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const pieces = pos.getAllPieces().filter((p) => p.color === pieceColor);
  const attackerColor = pieceColor === 'w' ? 'b' : 'w';

  for (const piece of pieces) {
    // Skip kings and pawns
    if (piece.type === 'k' || piece.type === 'p') continue;

    const pieceValue = getPieceValue(piece.type);
    if (pieceValue < 300) continue; // Only check valuable pieces

    // Get all legal moves for this piece
    const legalMoves = pos.getLegalMoves();
    const pieceMoves = legalMoves.filter((move) => {
      // UCI format: starts with piece's square
      if (move.length >= 4 && move.substring(0, 2) === piece.square) {
        return true;
      }
      return false;
    });

    if (pieceMoves.length === 0) {
      // No moves at all - dominated
      if (isHangingPiece(pos, piece.square)) {
        themes.push({
          id: 'domination',
          category: 'tactical',
          confidence: 'high',
          severity: 'critical',
          squares: [piece.square],
          pieces: [formatPieceAtSquare(piece as LocatedPiece)],
          beneficiary: attackerColor,
          explanation: `${pieceName(piece.type)} on ${piece.square} is trapped and hanging`,
          materialAtStake: pieceValue,
        });
      }
      continue;
    }

    // Check if all moves lose the piece
    let safeSquares = 0;
    for (const move of pieceMoves) {
      const toSquare = move.substring(2, 4);

      // Simulate the move and check if piece is safe
      const cloned = pos.clone();
      try {
        cloned.move(move);
        // Check if piece is now attacked more than defended
        const newAttackers = cloned.getAttackers(toSquare, attackerColor);
        const newDefenders = cloned.getAttackers(toSquare, pieceColor);

        // Piece is safe if not attacked, or defended enough
        if (newAttackers.length === 0 || newDefenders.length >= newAttackers.length) {
          safeSquares++;
        }
      } catch {
        // Move failed, skip
      }
    }

    if (safeSquares === 0 && pieceMoves.length > 0) {
      // All moves lose the piece
      themes.push({
        id: 'trapped_piece',
        category: 'tactical',
        confidence: 'high',
        severity: pieceValue >= 500 ? 'critical' : 'significant',
        squares: [piece.square],
        pieces: [formatPieceAtSquare(piece as LocatedPiece)],
        beneficiary: attackerColor,
        explanation: `${pieceName(piece.type)} on ${piece.square} is trapped with no safe squares`,
        materialAtStake: pieceValue,
      });
    }
  }

  return themes;
}

/**
 * Detect pieces that are hanging (attacked but not defended)
 */
export function detectHangingPieces(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  for (const color of ['w', 'b'] as Color[]) {
    const enemyColor = color === 'w' ? 'b' : 'w';
    const pieces = pos.getAllPieces().filter((p) => p.color === color);

    for (const piece of pieces) {
      if (piece.type === 'k') continue; // King can't be "hanging"

      const pieceValue = getPieceValue(piece.type);
      if (pieceValue < 100) continue;

      if (isHangingPiece(pos, piece.square)) {
        themes.push({
          id: 'trapped_piece', // Using trapped_piece as closest match
          category: 'tactical',
          confidence: 'high',
          severity: pieceValue >= 300 ? 'significant' : 'minor',
          squares: [piece.square],
          pieces: [formatPieceAtSquare(piece as LocatedPiece)],
          beneficiary: enemyColor,
          explanation: `${pieceName(piece.type)} on ${piece.square} is hanging`,
          materialAtStake: pieceValue,
        });
      }
    }
  }

  return themes;
}
