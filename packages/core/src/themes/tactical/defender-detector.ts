/**
 * Defender-Related Tactical Detection
 *
 * Detects tactics involving defenders:
 * - Overloaded piece: Piece defending multiple targets
 * - Remove defender: Can capture the sole defender
 * - Deflection: Can force defender away from duty
 * - Desperado: Piece that's lost anyway can cause damage
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color, LocatedPiece } from '../types.js';
import {
  getPieceValue,
  pieceName,
  formatPieceAtSquare,
  isHangingPiece,
} from '../utils/piece-utils.js';

/**
 * Detect all defender-related tactics
 */
export function detectDefenderTactics(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  for (const color of ['w', 'b'] as Color[]) {
    themes.push(...detectOverloadedPieces(pos, color));
    themes.push(...detectRemoveDefender(pos, color));
    themes.push(...detectDesperado(pos, color));
  }

  return themes;
}

/**
 * Detect overloaded pieces
 * A piece is overloaded if it defends multiple attacked pieces
 */
function detectOverloadedPieces(pos: ChessPosition, defenderColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const attackerColor = defenderColor === 'w' ? 'b' : 'w';
  const defenderPieces = pos.getAllPieces().filter((p) => p.color === defenderColor);

  // Build a map of what each piece defends
  const defenseMap = new Map<string, string[]>(); // defender square -> defended squares

  for (const defender of defenderPieces) {
    if (defender.type === 'k') continue; // King doesn't "defend" in this sense

    const defendedSquares: string[] = [];

    // Check all friendly pieces this defender protects
    for (const friendly of defenderPieces) {
      if (friendly.square === defender.square) continue;

      const attackers = pos.getAttackers(friendly.square, defenderColor);
      if (attackers.includes(defender.square)) {
        // This defender defends this friendly piece
        // Only count if the friendly is also attacked by enemy
        const enemyAttackers = pos.getAttackers(friendly.square, attackerColor);
        if (enemyAttackers.length > 0) {
          defendedSquares.push(friendly.square);
        }
      }
    }

    if (defendedSquares.length >= 2) {
      defenseMap.set(defender.square, defendedSquares);
    }
  }

  // Report overloaded pieces
  for (const [defenderSquare, defendedSquares] of defenseMap) {
    const defender = pos.getPiece(defenderSquare);
    if (!defender) continue;

    // Calculate total material at risk
    const defendedPieces = defendedSquares
      .map((sq) => pos.getPiece(sq))
      .filter((p) => p !== null) as Array<{ type: string; color: string }>;

    const materialAtStake = defendedPieces.reduce((sum, p) => sum + getPieceValue(p.type), 0);

    themes.push({
      id: 'overloaded_piece',
      category: 'tactical',
      confidence: 'high',
      severity: materialAtStake >= 600 ? 'critical' : 'significant',
      squares: [defenderSquare, ...defendedSquares],
      pieces: [
        formatPieceAtSquare({ ...defender, square: defenderSquare }),
        ...defendedPieces.map((p, i) =>
          formatPieceAtSquare({ ...p, square: defendedSquares[i]! } as LocatedPiece),
        ),
      ],
      beneficiary: attackerColor,
      explanation: `${pieceName(defender.type)} on ${defenderSquare} is overloaded, defending ${defendedSquares.length} attacked pieces`,
      materialAtStake,
    });
  }

  return themes;
}

/**
 * Detect remove defender opportunities
 * Can we capture a piece that is the sole defender of something valuable?
 */
function detectRemoveDefender(pos: ChessPosition, attackerColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const defenderColor = attackerColor === 'w' ? 'b' : 'w';
  const enemyPieces = pos.getAllPieces().filter((p) => p.color === defenderColor);

  // For each enemy piece that we attack
  for (const target of enemyPieces) {
    if (target.type === 'k') continue;

    const targetValue = getPieceValue(target.type);
    if (targetValue < 300) continue; // Only valuable targets

    // Get defenders of this piece
    const defenders = pos.getAttackers(target.square, defenderColor);
    const ourAttackers = pos.getAttackers(target.square, attackerColor);

    // If we attack it and it has exactly one defender
    if (ourAttackers.length > 0 && defenders.length === 1) {
      const defenderSquare = defenders[0]!;
      const defender = pos.getPiece(defenderSquare);
      if (!defender) continue;

      // Can we capture the defender?
      const defenderAttackers = pos.getAttackers(defenderSquare, attackerColor);

      if (defenderAttackers.length > 0) {
        // Is capturing the defender worth it?
        // Best case: we capture defender, then target
        // Evaluate if removing defender allows winning the target
        themes.push({
          id: 'remove_defender',
          category: 'tactical',
          confidence: 'high',
          severity: targetValue >= 500 ? 'critical' : 'significant',
          squares: [defenderSquare, target.square, defenderAttackers[0]!],
          pieces: [
            formatPieceAtSquare({ ...defender, square: defenderSquare }),
            formatPieceAtSquare(target as LocatedPiece),
          ],
          beneficiary: attackerColor,
          explanation: `${pieceName(defender.type)} on ${defenderSquare} is the sole defender of ${pieceName(target.type)}`,
          materialAtStake: targetValue,
        });
      }
    }
  }

  return themes;
}

/**
 * Detect deflection opportunities
 * Can we force a defender to move away from its defensive duty?
 */
export function detectDeflection(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const sideToMove = pos.turn();
  const enemyColor = sideToMove === 'w' ? 'b' : 'w';

  // For each legal capture we can make
  const legalMoves = pos.getLegalMoves();

  for (const move of legalMoves) {
    // Only consider captures
    if (!move.includes('x') && move.length === 4) {
      const toSquare = move.substring(2, 4);
      const capturedPiece = pos.getPiece(toSquare);
      if (!capturedPiece) continue;

      // What does this piece currently defend?
      const allEnemyPieces = pos.getAllPieces().filter((p) => p.color === enemyColor);
      const defendedTargets: Array<{ square: string; type: string; value: number }> = [];

      for (const enemy of allEnemyPieces) {
        if (enemy.square === toSquare) continue;

        const defenders = pos.getAttackers(enemy.square, enemyColor);
        if (defenders.includes(toSquare)) {
          // This captured piece defends this target
          const ourAttackers = pos.getAttackers(enemy.square, sideToMove);
          const otherDefenders = defenders.filter((d) => d !== toSquare);

          // If we also attack this target and removing defender makes it vulnerable
          if (ourAttackers.length > otherDefenders.length) {
            defendedTargets.push({
              square: enemy.square,
              type: enemy.type,
              value: getPieceValue(enemy.type),
            });
          }
        }
      }

      if (defendedTargets.length > 0) {
        const bestTarget = defendedTargets.sort((a, b) => b.value - a.value)[0]!;

        themes.push({
          id: 'deflection',
          category: 'tactical',
          confidence: 'medium',
          severity: bestTarget.value >= 500 ? 'critical' : 'significant',
          squares: [toSquare, bestTarget.square],
          pieces: [
            formatPieceAtSquare({ ...capturedPiece, square: toSquare }),
            `${bestTarget.type.toUpperCase()}${bestTarget.square}`,
          ],
          beneficiary: sideToMove,
          explanation: `Capturing on ${toSquare} deflects defender from ${pieceName(bestTarget.type)}`,
          materialAtStake: bestTarget.value,
        });
      }
    }
  }

  // Deduplicate by target square
  const unique = new Map<string, DetectedTheme>();
  for (const theme of themes) {
    const key = theme.squares?.[1] ?? '';
    const existing = unique.get(key);
    if (!existing || (theme.materialAtStake ?? 0) > (existing.materialAtStake ?? 0)) {
      unique.set(key, theme);
    }
  }

  return Array.from(unique.values());
}

/**
 * Detect desperado situations
 * A piece that will be lost can capture something first
 */
function detectDesperado(pos: ChessPosition, pieceColor: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = pieceColor === 'w' ? 'b' : 'w';
  const ourPieces = pos.getAllPieces().filter((p) => p.color === pieceColor);

  for (const piece of ourPieces) {
    if (piece.type === 'k') continue;

    const pieceValue = getPieceValue(piece.type);

    // Check if this piece is under attack and can't escape
    if (isHangingPiece(pos, piece.square)) {
      // This piece is hanging - can it take something before it dies?
      // Find what this piece attacks
      const legalMoves = pos.getLegalMoves();
      const pieceMoves = legalMoves.filter(
        (m) => m.length >= 4 && m.substring(0, 2) === piece.square,
      );

      for (const move of pieceMoves) {
        const toSquare = move.substring(2, 4);
        const targetPiece = pos.getPiece(toSquare);

        if (targetPiece && targetPiece.color === enemyColor) {
          const targetValue = getPieceValue(targetPiece.type);

          // Desperado if we can capture something valuable before dying
          if (targetValue >= pieceValue * 0.5) {
            themes.push({
              id: 'desperado',
              category: 'tactical',
              confidence: 'medium',
              severity: targetValue >= 300 ? 'significant' : 'minor',
              squares: [piece.square, toSquare],
              pieces: [
                formatPieceAtSquare(piece as LocatedPiece),
                formatPieceAtSquare({ ...targetPiece, square: toSquare }),
              ],
              beneficiary: pieceColor,
              explanation: `${pieceName(piece.type)} is lost but can capture ${pieceName(targetPiece.type)} first`,
              materialAtStake: targetValue,
            });
          }
        }
      }
    }
  }

  return themes;
}
