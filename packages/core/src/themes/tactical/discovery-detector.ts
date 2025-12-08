/**
 * Discovered Attack/Check Detection
 *
 * Detects discovered tactics:
 * - Discovered attack: Moving a piece reveals attack from piece behind
 * - Discovered check: Discovered attack is a check on the king
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color, LocatedPiece } from '../types.js';
import {
  getSlidingPieces,
  getPieceValue,
  pieceName,
  formatPieceAtSquare,
  findKing,
} from '../utils/piece-utils.js';
import { getDirectionsForPiece, getPiecesOnRay } from '../utils/ray-casting.js';

/**
 * Detect all discovered attack opportunities
 */
export function detectDiscoveries(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  // Check discoveries by each color
  for (const color of ['w', 'b'] as Color[]) {
    themes.push(...detectDiscoveriesForColor(pos, color));
  }

  return themes;
}

/**
 * Detect discovered attack/check opportunities for a color
 *
 * A discovered attack exists when:
 * 1. A sliding piece (attacker) has line of sight to valuable target
 * 2. A friendly piece (blocker) is in between
 * 3. Moving the blocker would reveal the attack
 */
function detectDiscoveriesForColor(pos: ChessPosition, attackerColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = attackerColor === 'w' ? 'b' : 'w';
  const slidingPieces = getSlidingPieces(pos, attackerColor);

  for (const attacker of slidingPieces) {
    const directions = getDirectionsForPiece(attacker.type);

    for (const dir of directions) {
      const piecesOnRay = getPiecesOnRay(pos, attacker.square, dir);

      // Need at least 2 pieces: blocker + target
      if (piecesOnRay.length < 2) continue;

      const blocker = piecesOnRay[0]!;
      const target = piecesOnRay[1]!;

      // Blocker must be OUR piece, target must be enemy
      if (blocker.color !== attackerColor || target.color !== enemyColor) continue;

      // Check if blocker can actually move (has legal moves)
      // This is important - a piece that can't move can't create a discovery
      const blockerMoves = getBlockerMoves(pos, blocker.square);
      if (blockerMoves.length === 0) continue;

      // Calculate material at stake
      const targetValue = getPieceValue(target.type);

      // Is this a discovered check?
      const isDiscoveredCheck = target.type === 'k';

      if (isDiscoveredCheck) {
        themes.push({
          id: 'discovered_check',
          category: 'tactical',
          confidence: 'high',
          severity: 'critical',
          squares: [attacker.square, blocker.square, target.square],
          pieces: [
            formatPieceAtSquare(attacker),
            formatPieceAtSquare(blocker),
            formatPieceAtSquare(target),
          ],
          beneficiary: attackerColor,
          explanation: `${pieceName(blocker.type)} can move to reveal discovered check from ${pieceName(attacker.type)}`,
          materialAtStake: 0, // King must deal with check
        });
      } else if (targetValue >= 300) {
        // Only report discovered attacks on valuable pieces
        themes.push({
          id: 'discovered_attack',
          category: 'tactical',
          confidence: 'high',
          severity: targetValue >= 900 ? 'critical' : 'significant',
          squares: [attacker.square, blocker.square, target.square],
          pieces: [
            formatPieceAtSquare(attacker),
            formatPieceAtSquare(blocker),
            formatPieceAtSquare(target),
          ],
          beneficiary: attackerColor,
          explanation: `${pieceName(blocker.type)} can move to reveal attack on ${pieceName(target.type)} from ${pieceName(attacker.type)}`,
          materialAtStake: targetValue,
        });
      }
    }
  }

  return themes;
}

/**
 * Get squares a blocking piece can move to
 */
function getBlockerMoves(pos: ChessPosition, square: string): string[] {
  const legalMoves = pos.getLegalMoves();
  const movesFromSquare: string[] = [];

  for (const move of legalMoves) {
    // Extract "from" square from move notation
    // Handle different formats: "e2e4", "Nf3", etc.
    const from = extractFromSquare(move, square, pos);
    if (from === square) {
      movesFromSquare.push(move);
    }
  }

  return movesFromSquare;
}

/**
 * Extract the "from" square from a move
 */
function extractFromSquare(
  move: string,
  candidateSquare: string,
  pos: ChessPosition,
): string | null {
  // UCI format: "e2e4" (4 chars) or "e7e8q" (5 chars for promotion)
  if (move.length >= 4 && move.match(/^[a-h][1-8][a-h][1-8]/)) {
    return move.substring(0, 2);
  }

  // SAN format: parse based on piece on candidate square
  const piece = pos.getPiece(candidateSquare);
  if (!piece) return null;

  // Pawn moves
  if (piece.type === 'p') {
    // Pawn captures: "exd5" or "dxe4"
    if (move.includes('x') && move[0]?.toLowerCase() === candidateSquare[0]) {
      return candidateSquare;
    }
    // Pawn pushes: "e4", "e8=Q"
    const targetFile = move[0]?.toLowerCase();
    if (targetFile === candidateSquare[0] && !move.includes('x')) {
      return candidateSquare;
    }
  }

  // Piece moves: "Nf3", "Nxf3", "Ngf3", "N1f3", "Ng1f3"
  const pieceChar = piece.type.toUpperCase();
  if (move.startsWith(pieceChar) || (move.startsWith('K') && piece.type === 'k')) {
    // Check if this move could originate from candidateSquare
    // This is approximate - full validation would require move parsing
    return candidateSquare;
  }

  return null;
}

/**
 * Detect potential discovered check patterns (one move away)
 * This finds positions where a piece could be moved to create a discovery
 */
export function detectPotentialDiscoveries(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const sideToMove = pos.turn();
  const enemyColor = sideToMove === 'w' ? 'b' : 'w';
  const enemyKingSquare = findKing(pos, enemyColor);

  if (!enemyKingSquare) return themes;

  // For each of our sliding pieces, check if king is in line
  const slidingPieces = getSlidingPieces(pos, sideToMove);

  for (const slider of slidingPieces) {
    const directions = getDirectionsForPiece(slider.type);

    for (const dir of directions) {
      const piecesOnRay = getPiecesOnRay(pos, slider.square, dir);

      // Look for our piece blocking the line to enemy king
      for (let i = 0; i < piecesOnRay.length; i++) {
        const piece = piecesOnRay[i]!;

        if (piece.color === sideToMove && piece.type !== 'k') {
          // Found a potential blocker - is the king behind?
          const remaining = piecesOnRay.slice(i + 1);
          const kingBehind = remaining.find((p) => p.type === 'k' && p.color === enemyColor);

          if (kingBehind) {
            // Check if the blocker has moves that also attack something
            const blockerAttacks = findBlockerAttacks(pos, piece, slider);

            if (blockerAttacks.length > 0) {
              const bestTarget = blockerAttacks.sort(
                (a, b) => getPieceValue(b.type) - getPieceValue(a.type),
              )[0]!;

              themes.push({
                id: 'discovered_check',
                category: 'tactical',
                confidence: 'medium',
                severity: 'critical',
                squares: [slider.square, piece.square, kingBehind.square, bestTarget.square],
                pieces: [
                  formatPieceAtSquare(slider),
                  formatPieceAtSquare(piece as LocatedPiece),
                  `K${kingBehind.square}`,
                ],
                beneficiary: sideToMove,
                explanation: `${pieceName(piece.type)} can create discovered check while attacking ${pieceName(bestTarget.type)}`,
                materialAtStake: getPieceValue(bestTarget.type),
              });
            }
          }
          break; // Stop at first friendly piece
        } else if (piece.color === enemyColor) {
          break; // Blocked by enemy piece
        }
      }
    }
  }

  return themes;
}

/**
 * Find pieces the blocker could attack when moved
 */
function findBlockerAttacks(
  pos: ChessPosition,
  blocker: { type: string; color: string; square: string },
  _slider: LocatedPiece,
): Array<{ type: string; square: string }> {
  const attacks: Array<{ type: string; square: string }> = [];
  const enemyColor = blocker.color === 'w' ? 'b' : 'w';
  const enemyPieces = pos.getAllPieces().filter((p) => p.color === enemyColor);

  // For each legal move of the blocker, check what it attacks
  const legalMoves = pos.getLegalMoves();

  for (const move of legalMoves) {
    // Check if this move is from the blocker's square
    if (move.length >= 4 && move.substring(0, 2) === blocker.square) {
      const toSquare = move.substring(2, 4);

      // Check if this captures an enemy piece
      for (const enemy of enemyPieces) {
        if (enemy.square === toSquare) {
          attacks.push({ type: enemy.type, square: enemy.square });
        }
      }
    }
  }

  return attacks;
}
