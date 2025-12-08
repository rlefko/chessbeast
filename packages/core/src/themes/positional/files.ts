/**
 * File Control Detection
 *
 * Detects file-related positional themes:
 * - Open file: No pawns of either color
 * - Semi-open file: Only enemy pawns (attacking opportunities)
 * - File control: Major pieces controlling open/semi-open files
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, Color } from '../types.js';
import { fileIndex } from '../utils/square-utils.js';

/**
 * Detect all file-related themes
 */
export function detectFileThemes(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  // Get pawn structure
  const whitePawns = pos.getAllPieces().filter((p) => p.color === 'w' && p.type === 'p');
  const blackPawns = pos.getAllPieces().filter((p) => p.color === 'b' && p.type === 'p');

  // Analyze each file
  for (let file = 0; file < 8; file++) {
    const fileChar = String.fromCharCode(97 + file);
    const whitePawnsOnFile = whitePawns.filter((p) => fileIndex(p.square) === file);
    const blackPawnsOnFile = blackPawns.filter((p) => fileIndex(p.square) === file);

    const isOpen = whitePawnsOnFile.length === 0 && blackPawnsOnFile.length === 0;
    const isSemiOpenForWhite = whitePawnsOnFile.length === 0 && blackPawnsOnFile.length > 0;
    const isSemiOpenForBlack = blackPawnsOnFile.length === 0 && whitePawnsOnFile.length > 0;

    if (isOpen) {
      // Check who controls the file
      const control = analyzeFileControl(pos, file);

      themes.push({
        id: 'open_file',
        category: 'positional',
        confidence: 'high',
        severity: control.controlled ? 'significant' : 'minor',
        squares: control.squares,
        pieces: control.pieces,
        beneficiary: control.controller,
        explanation: `Open ${fileChar}-file${control.controlled ? ` controlled by ${control.controller === 'w' ? 'White' : 'Black'}` : ''}`,
      });
    } else if (isSemiOpenForWhite) {
      const control = analyzeFileControl(pos, file);
      const hasRookOnFile = control.pieces.some((p) => p.startsWith('R') || p.startsWith('Q'));

      if (hasRookOnFile || isImportantFile(file)) {
        themes.push({
          id: 'semi_open_file',
          category: 'positional',
          confidence: 'high',
          severity: hasRookOnFile ? 'significant' : 'minor',
          squares: control.squares,
          pieces: control.pieces.filter((p) => p.startsWith('R') || p.startsWith('Q')),
          beneficiary: 'w',
          explanation: `Semi-open ${fileChar}-file for White${hasRookOnFile ? ' with major piece' : ''}`,
        });
      }
    } else if (isSemiOpenForBlack) {
      const control = analyzeFileControl(pos, file);
      const hasRookOnFile = control.pieces.some(
        (p) => p.toLowerCase().startsWith('r') || p.toLowerCase().startsWith('q'),
      );

      if (hasRookOnFile || isImportantFile(file)) {
        themes.push({
          id: 'semi_open_file',
          category: 'positional',
          confidence: 'high',
          severity: hasRookOnFile ? 'significant' : 'minor',
          squares: control.squares,
          pieces: control.pieces.filter((p) => p.startsWith('R') || p.startsWith('Q')),
          beneficiary: 'b',
          explanation: `Semi-open ${fileChar}-file for Black${hasRookOnFile ? ' with major piece' : ''}`,
        });
      }
    }
  }

  return themes;
}

/**
 * Analyze who controls a file
 */
function analyzeFileControl(
  pos: ChessPosition,
  file: number,
): {
  controlled: boolean;
  controller: Color;
  squares: string[];
  pieces: string[];
} {
  const allPieces = pos.getAllPieces();

  // Find major pieces on this file
  const whiteMajors = allPieces.filter(
    (p) => p.color === 'w' && (p.type === 'r' || p.type === 'q') && fileIndex(p.square) === file,
  );
  const blackMajors = allPieces.filter(
    (p) => p.color === 'b' && (p.type === 'r' || p.type === 'q') && fileIndex(p.square) === file,
  );

  // Calculate control based on major piece presence
  const whiteControl = whiteMajors.reduce((sum, p) => sum + (p.type === 'q' ? 2 : 1), 0);
  const blackControl = blackMajors.reduce((sum, p) => sum + (p.type === 'q' ? 2 : 1), 0);

  const squares: string[] = [];
  const pieces: string[] = [];

  for (const p of [...whiteMajors, ...blackMajors]) {
    squares.push(p.square);
    pieces.push(`${p.type.toUpperCase()}${p.square}`);
  }

  if (whiteControl > blackControl) {
    return { controlled: true, controller: 'w', squares, pieces };
  } else if (blackControl > whiteControl) {
    return { controlled: true, controller: 'b', squares, pieces };
  }

  return { controlled: false, controller: 'w', squares, pieces };
}

/**
 * Check if a file is strategically important (d, e files)
 */
function isImportantFile(file: number): boolean {
  return file === 3 || file === 4; // d and e files
}

/**
 * Detect potential file operations (rooks that could move to open files)
 */
export function detectFileOperations(pos: ChessPosition): DetectedTheme[] {
  const themes: DetectedTheme[] = [];

  for (const color of ['w', 'b'] as Color[]) {
    themes.push(...detectFileOperationsForColor(pos, color));
  }

  return themes;
}

/**
 * Detect rooks that could move to open/semi-open files
 */
function detectFileOperationsForColor(pos: ChessPosition, color: Color): DetectedTheme[] {
  const themes: DetectedTheme[] = [];
  const enemyColor = color === 'w' ? 'b' : 'w';

  const rooks = pos.getAllPieces().filter((p) => p.color === color && p.type === 'r');
  const ourPawns = pos.getAllPieces().filter((p) => p.color === color && p.type === 'p');
  const enemyPawns = pos.getAllPieces().filter((p) => p.color === enemyColor && p.type === 'p');

  for (const rook of rooks) {
    const rookFile = fileIndex(rook.square);

    // Check if rook is NOT on an open/semi-open file
    const ourPawnsOnFile = ourPawns.filter((p) => fileIndex(p.square) === rookFile);

    if (ourPawnsOnFile.length > 0) {
      // Rook is behind own pawns - look for open files it could reach
      for (let targetFile = 0; targetFile < 8; targetFile++) {
        if (targetFile === rookFile) continue;

        const ourPawnsOnTarget = ourPawns.filter((p) => fileIndex(p.square) === targetFile);
        const enemyPawnsOnTarget = enemyPawns.filter((p) => fileIndex(p.square) === targetFile);

        const isOpen = ourPawnsOnTarget.length === 0 && enemyPawnsOnTarget.length === 0;
        const isSemiOpen = ourPawnsOnTarget.length === 0 && enemyPawnsOnTarget.length > 0;

        if (isOpen || isSemiOpen) {
          const targetSquare = String.fromCharCode(97 + targetFile) + rook.square[1];

          // Check if the path is clear
          const pathClear = isRookPathClear(pos, rook.square, targetSquare);

          if (pathClear) {
            themes.push({
              id: isOpen ? 'open_file' : 'semi_open_file',
              category: 'positional',
              confidence: 'low',
              severity: 'minor',
              squares: [rook.square, targetSquare],
              pieces: [`R${rook.square}`],
              beneficiary: color,
              explanation: `Rook could move to ${isOpen ? 'open' : 'semi-open'} ${String.fromCharCode(97 + targetFile)}-file`,
            });
            break; // Only report one potential move per rook
          }
        }
      }
    }
  }

  return themes;
}

/**
 * Check if rook has clear horizontal path
 */
function isRookPathClear(pos: ChessPosition, from: string, to: string): boolean {
  const fromFile = fileIndex(from);
  const toFile = fileIndex(to);
  const rank = from[1];

  const minFile = Math.min(fromFile, toFile);
  const maxFile = Math.max(fromFile, toFile);

  for (let f = minFile + 1; f < maxFile; f++) {
    const square = String.fromCharCode(97 + f) + rank;
    if (pos.getPiece(square)) return false;
  }

  return true;
}
