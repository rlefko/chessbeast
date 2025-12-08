/**
 * Pawn Structure Analysis
 *
 * Detects pawn structure themes:
 * - Weak pawns (isolated, doubled, backward)
 * - Passed pawns
 * - Pawn breaks available
 * - Pawn majorities
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color } from '../types.js';
import { fileIndex, rankIndex, getAdjacentFiles } from '../utils/square-utils.js';

/**
 * Detect all pawn structure themes
 */
export function detectPawnStructure(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  for (const color of ['w', 'b'] as Color[]) {
    themes.push(...detectIsolatedPawns(pos, color));
    themes.push(...detectDoubledPawns(pos, color));
    themes.push(...detectBackwardPawns(pos, color));
    themes.push(...detectPassedPawns(pos, color));
    themes.push(...detectPawnBreaks(pos, color));
    themes.push(...detectWeakPawns(pos, color));
    themes.push(...detectSteamrolling(pos, color));
  }

  themes.push(...detectPawnMajority(pos));

  return themes;
}

/**
 * Detect isolated pawns (no friendly pawns on adjacent files)
 */
function detectIsolatedPawns(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = color === 'w' ? 'b' : 'w';
  const pawns = pos.getAllPieces().filter((p) => p.color === color && p.type === 'p');

  // Group pawns by file
  const pawnsByFile = new Map<number, typeof pawns>();
  for (const pawn of pawns) {
    const file = fileIndex(pawn.square);
    const existing = pawnsByFile.get(file) || [];
    existing.push(pawn);
    pawnsByFile.set(file, existing);
  }

  // Check each pawn for isolation
  for (const pawn of pawns) {
    const file = fileIndex(pawn.square);
    const adjacentFiles = getAdjacentFiles(file);

    const hasAdjacentPawn = adjacentFiles.some((f) => (pawnsByFile.get(f) || []).length > 0);

    if (!hasAdjacentPawn) {
      // Check if it's attacked (more severe if attacked)
      const isAttacked = pos.isSquareAttacked(pawn.square, enemyColor);

      themes.push({
        id: 'isolated_pawn',
        category: 'positional',
        confidence: 'high',
        severity: isAttacked ? 'significant' : 'minor',
        squares: [pawn.square],
        pieces: [`P${pawn.square}`],
        beneficiary: enemyColor,
        explanation: `Isolated pawn on ${pawn.square}${isAttacked ? ' is under attack' : ''}`,
        materialAtStake: 50, // Structural weakness value
      });
    }
  }

  return themes;
}

/**
 * Detect doubled pawns (multiple pawns on same file)
 */
function detectDoubledPawns(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = color === 'w' ? 'b' : 'w';
  const pawns = pos.getAllPieces().filter((p) => p.color === color && p.type === 'p');

  // Group pawns by file
  const pawnsByFile = new Map<number, typeof pawns>();
  for (const pawn of pawns) {
    const file = fileIndex(pawn.square);
    const existing = pawnsByFile.get(file) || [];
    existing.push(pawn);
    pawnsByFile.set(file, existing);
  }

  // Find doubled pawns
  for (const [file, filePawns] of pawnsByFile) {
    if (filePawns.length >= 2) {
      const fileChar = String.fromCharCode(97 + file);

      // Check if also isolated (doubled isolated is very weak)
      const adjacentFiles = getAdjacentFiles(file);
      const hasAdjacentPawn = adjacentFiles.some((f) => (pawnsByFile.get(f) || []).length > 0);

      themes.push({
        id: 'doubled_pawns',
        category: 'positional',
        confidence: 'high',
        severity: hasAdjacentPawn ? 'minor' : 'significant',
        squares: filePawns.map((p) => p.square),
        pieces: filePawns.map((p) => `P${p.square}`),
        beneficiary: enemyColor,
        explanation: `Doubled pawns on the ${fileChar}-file${!hasAdjacentPawn ? ' (isolated)' : ''}`,
        materialAtStake: hasAdjacentPawn ? 30 : 70,
      });
    }
  }

  return themes;
}

/**
 * Detect backward pawns
 * A pawn is backward if it cannot be protected by other pawns and
 * is on a half-open file facing enemy pawns
 */
function detectBackwardPawns(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = color === 'w' ? 'b' : 'w';
  const pawns = pos.getAllPieces().filter((p) => p.color === color && p.type === 'p');
  const enemyPawns = pos.getAllPieces().filter((p) => p.color === enemyColor && p.type === 'p');

  // Group pawns by file
  const pawnsByFile = new Map<number, number[]>(); // file -> ranks
  for (const pawn of pawns) {
    const file = fileIndex(pawn.square);
    const rank = rankIndex(pawn.square);
    const existing = pawnsByFile.get(file) || [];
    existing.push(rank);
    pawnsByFile.set(file, existing);
  }

  for (const pawn of pawns) {
    const file = fileIndex(pawn.square);
    const rank = rankIndex(pawn.square);
    const adjacentFiles = getAdjacentFiles(file);

    // Check if any adjacent pawn is behind us (lower rank for white, higher for black)
    const adjacentRanks = adjacentFiles.flatMap((f) => pawnsByFile.get(f) || []);

    const direction = color === 'w' ? 1 : -1;
    const isBehindAll = adjacentRanks.every((r) => (color === 'w' ? r >= rank : r <= rank));

    if (!isBehindAll || adjacentRanks.length === 0) continue;

    // Check if enemy pawn controls the square in front
    const frontSquare = String.fromCharCode(97 + file) + (rank + direction);
    const enemyControls = enemyPawns.some((ep) => {
      const epFile = fileIndex(ep.square);
      const epRank = rankIndex(ep.square);
      // Enemy pawn controls frontSquare if it's on adjacent file and appropriate rank
      return (
        adjacentFiles.includes(epFile) &&
        (color === 'w' ? epRank === rank + 2 : epRank === rank - 2)
      );
    });

    if (enemyControls) {
      themes.push({
        id: 'backward_pawn',
        category: 'positional',
        confidence: 'high',
        severity: 'minor',
        squares: [pawn.square, frontSquare],
        pieces: [`P${pawn.square}`],
        beneficiary: enemyColor,
        explanation: `Backward pawn on ${pawn.square} cannot advance safely`,
        materialAtStake: 40,
      });
    }
  }

  return themes;
}

/**
 * Detect passed pawns
 * A pawn is passed if no enemy pawns can stop its advance
 */
function detectPassedPawns(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = color === 'w' ? 'b' : 'w';
  const pawns = pos.getAllPieces().filter((p) => p.color === color && p.type === 'p');
  const enemyPawns = pos.getAllPieces().filter((p) => p.color === enemyColor && p.type === 'p');

  for (const pawn of pawns) {
    const file = fileIndex(pawn.square);
    const rank = rankIndex(pawn.square);
    const adjacentFiles = [file - 1, file, file + 1].filter((f) => f >= 0 && f < 8);

    // Check if any enemy pawn can block or capture
    const isPassed = !enemyPawns.some((ep) => {
      const epFile = fileIndex(ep.square);
      const epRank = rankIndex(ep.square);

      // Enemy pawn must be on same or adjacent file
      if (!adjacentFiles.includes(epFile)) return false;

      // Enemy pawn must be ahead of us
      if (color === 'w') {
        return epRank > rank;
      } else {
        return epRank < rank;
      }
    });

    if (isPassed) {
      // Calculate how advanced the passer is
      const promotionDistance = color === 'w' ? 8 - rank : rank - 1;
      const severity =
        promotionDistance <= 2 ? 'critical' : promotionDistance <= 4 ? 'significant' : 'minor';

      themes.push({
        id: 'passed_pawn',
        category: 'positional',
        confidence: 'high',
        severity,
        squares: [pawn.square],
        pieces: [`P${pawn.square}`],
        beneficiary: color,
        explanation: `Passed pawn on ${pawn.square}, ${promotionDistance} squares from promotion`,
        materialAtStake: Math.max(100, 200 - promotionDistance * 30),
      });
    }
  }

  return themes;
}

/**
 * Detect available pawn breaks
 * Pawn advances that challenge the enemy pawn structure
 */
function detectPawnBreaks(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = color === 'w' ? 'b' : 'w';
  const ourPawns = pos.getAllPieces().filter((p) => p.color === color && p.type === 'p');
  const enemyPawns = pos.getAllPieces().filter((p) => p.color === enemyColor && p.type === 'p');

  // Only check if it's our turn
  if (pos.turn() !== color) return themes;

  for (const pawn of ourPawns) {
    const file = fileIndex(pawn.square);
    const rank = rankIndex(pawn.square);
    const direction = color === 'w' ? 1 : -1;

    // Check diagonal captures
    for (const targetFile of [file - 1, file + 1]) {
      if (targetFile < 0 || targetFile > 7) continue;

      const targetRank = rank + direction;
      if (targetRank < 1 || targetRank > 8) continue;

      const targetSquare = String.fromCharCode(97 + targetFile) + targetRank;
      const targetPiece = pos.getPiece(targetSquare);

      // Is there an enemy pawn we can capture?
      if (targetPiece && targetPiece.type === 'p' && targetPiece.color === enemyColor) {
        // Check if this capture opens a file or weakens their structure
        const enemyFile = targetFile;
        const enemyPawnsOnFile = enemyPawns.filter((ep) => fileIndex(ep.square) === enemyFile);

        if (enemyPawnsOnFile.length === 1) {
          // Capturing removes their last pawn on this file - opens the file
          themes.push({
            id: 'pawn_break_available',
            category: 'positional',
            confidence: 'medium',
            severity: 'minor',
            squares: [pawn.square, targetSquare],
            pieces: [`P${pawn.square}`],
            beneficiary: color,
            explanation: `Pawn break ${pawn.square}x${targetSquare} opens the ${String.fromCharCode(97 + enemyFile)}-file`,
            materialAtStake: 0,
          });
        }
      }
    }
  }

  return themes;
}

/**
 * Detect pawn majorities
 * When one side has more pawns on a wing
 */
function detectPawnMajority(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const whitePawns = pos.getAllPieces().filter((p) => p.color === 'w' && p.type === 'p');
  const blackPawns = pos.getAllPieces().filter((p) => p.color === 'b' && p.type === 'p');

  // Queenside (a-d files, indices 0-3)
  const whiteQueenside = whitePawns.filter((p) => fileIndex(p.square) <= 3).length;
  const blackQueenside = blackPawns.filter((p) => fileIndex(p.square) <= 3).length;

  // Kingside (e-h files, indices 4-7)
  const whiteKingside = whitePawns.filter((p) => fileIndex(p.square) >= 4).length;
  const blackKingside = blackPawns.filter((p) => fileIndex(p.square) >= 4).length;

  // Queenside majority
  if (whiteQueenside > blackQueenside + 1) {
    themes.push({
      id: 'pawn_majority',
      category: 'positional',
      confidence: 'high',
      severity: 'minor',
      squares: whitePawns.filter((p) => fileIndex(p.square) <= 3).map((p) => p.square),
      pieces: [],
      beneficiary: 'w',
      explanation: `White has a queenside pawn majority (${whiteQueenside} vs ${blackQueenside})`,
    });
  } else if (blackQueenside > whiteQueenside + 1) {
    themes.push({
      id: 'pawn_majority',
      category: 'positional',
      confidence: 'high',
      severity: 'minor',
      squares: blackPawns.filter((p) => fileIndex(p.square) <= 3).map((p) => p.square),
      pieces: [],
      beneficiary: 'b',
      explanation: `Black has a queenside pawn majority (${blackQueenside} vs ${whiteQueenside})`,
    });
  }

  // Kingside majority
  if (whiteKingside > blackKingside + 1) {
    themes.push({
      id: 'pawn_majority',
      category: 'positional',
      confidence: 'high',
      severity: 'minor',
      squares: whitePawns.filter((p) => fileIndex(p.square) >= 4).map((p) => p.square),
      pieces: [],
      beneficiary: 'w',
      explanation: `White has a kingside pawn majority (${whiteKingside} vs ${blackKingside})`,
    });
  } else if (blackKingside > whiteKingside + 1) {
    themes.push({
      id: 'pawn_majority',
      category: 'positional',
      confidence: 'high',
      severity: 'minor',
      squares: blackPawns.filter((p) => fileIndex(p.square) >= 4).map((p) => p.square),
      pieces: [],
      beneficiary: 'b',
      explanation: `Black has a kingside pawn majority (${blackKingside} vs ${whiteKingside})`,
    });
  }

  return themes;
}

/**
 * Detect generic weak pawns
 * A pawn is weak if it cannot be defended by other pawns
 * This is a catch-all for pawns that aren't isolated, doubled, or backward
 * but are still structurally weak
 */
function detectWeakPawns(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = color === 'w' ? 'b' : 'w';
  const pawns = pos.getAllPieces().filter((p) => p.color === color && p.type === 'p');

  // Group pawns by file
  const pawnsByFile = new Map<number, typeof pawns>();
  for (const pawn of pawns) {
    const file = fileIndex(pawn.square);
    const existing = pawnsByFile.get(file) || [];
    existing.push(pawn);
    pawnsByFile.set(file, existing);
  }

  for (const pawn of pawns) {
    const file = fileIndex(pawn.square);
    const rank = rankIndex(pawn.square);
    const adjacentFiles = getAdjacentFiles(file);

    // Check if this pawn can be defended by another pawn
    let canBeDefended = false;
    for (const adjFile of adjacentFiles) {
      const adjPawns = pawnsByFile.get(adjFile) || [];
      for (const adjPawn of adjPawns) {
        const adjRank = rankIndex(adjPawn.square);
        // Can defend if on adjacent file and one rank behind
        const defendRank = color === 'w' ? rank - 1 : rank + 1;
        if (adjRank === defendRank) {
          canBeDefended = true;
          break;
        }
      }
      if (canBeDefended) break;
    }

    // If cannot be defended by pawns, check if attacked
    if (!canBeDefended) {
      const isAttacked = pos.isSquareAttacked(pawn.square, enemyColor);
      const defenders = pos.getAttackers(pawn.square, color);

      // Weak if attacked more than defended, or undefendable
      if (isAttacked && defenders.length === 0) {
        themes.push({
          id: 'weak_pawn',
          category: 'positional',
          confidence: 'medium',
          severity: 'minor',
          squares: [pawn.square],
          pieces: [`P${pawn.square}`],
          beneficiary: enemyColor,
          explanation: `Weak pawn on ${pawn.square} cannot be defended by other pawns`,
          materialAtStake: 50,
        });
      }
    }
  }

  return themes;
}

/**
 * Detect steamrolling - connected passed pawns advancing together
 * Multiple connected passed pawns that are advancing and difficult to stop
 */
function detectSteamrolling(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = color === 'w' ? 'b' : 'w';
  const pawns = pos.getAllPieces().filter((p) => p.color === color && p.type === 'p');
  const enemyPawns = pos.getAllPieces().filter((p) => p.color === enemyColor && p.type === 'p');

  // Find passed pawns
  const passedPawns: Array<{ square: string; file: number; rank: number }> = [];

  for (const pawn of pawns) {
    const file = fileIndex(pawn.square);
    const rank = rankIndex(pawn.square);
    const adjacentFiles = [file - 1, file, file + 1].filter((f) => f >= 0 && f < 8);

    const isPassed = !enemyPawns.some((ep) => {
      const epFile = fileIndex(ep.square);
      const epRank = rankIndex(ep.square);

      if (!adjacentFiles.includes(epFile)) return false;

      return color === 'w' ? epRank > rank : epRank < rank;
    });

    if (isPassed) {
      passedPawns.push({ square: pawn.square, file, rank });
    }
  }

  // Check for connected passed pawns (2+ on adjacent files)
  if (passedPawns.length >= 2) {
    // Sort by file
    passedPawns.sort((a, b) => a.file - b.file);

    // Find groups of connected passers
    const connectedGroups: Array<typeof passedPawns> = [];
    let currentGroup: typeof passedPawns = [passedPawns[0]!];

    for (let i = 1; i < passedPawns.length; i++) {
      const prev = passedPawns[i - 1]!;
      const curr = passedPawns[i]!;

      if (curr.file - prev.file === 1) {
        // Adjacent files - connected
        currentGroup.push(curr);
      } else {
        // Not connected - start new group
        if (currentGroup.length >= 2) {
          connectedGroups.push([...currentGroup]);
        }
        currentGroup = [curr];
      }
    }

    // Don't forget the last group
    if (currentGroup.length >= 2) {
      connectedGroups.push(currentGroup);
    }

    // Report steamrolling for each connected group
    for (const group of connectedGroups) {
      // Calculate how advanced they are
      const avgRank = group.reduce((sum, p) => sum + p.rank, 0) / group.length;
      const advancedThreshold = color === 'w' ? 4 : 3;

      if (
        (color === 'w' && avgRank >= advancedThreshold) ||
        (color === 'b' && avgRank <= advancedThreshold)
      ) {
        const promotionDistances = group.map((p) => (color === 'w' ? 8 - p.rank : p.rank - 1));
        const avgDistance = promotionDistances.reduce((a, b) => a + b, 0) / group.length;

        themes.push({
          id: 'steamrolling',
          category: 'positional',
          confidence: 'high',
          severity: avgDistance <= 3 ? 'critical' : 'significant',
          squares: group.map((p) => p.square),
          pieces: group.map((p) => `P${p.square}`),
          beneficiary: color,
          explanation: `${group.length} connected passed pawns steamrolling forward`,
          materialAtStake: group.length * 150,
        });
      }
    }
  }

  return themes;
}
