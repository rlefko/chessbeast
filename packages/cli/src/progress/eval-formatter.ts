/**
 * Chess evaluation formatting utilities
 * Extracted from ProgressReporter for SRP compliance
 */

import type { ColorFn } from './types.js';

/**
 * Format evaluation in chess-friendly format: centipawns + verbal
 * e.g., "+4.28 (White winning)" or "M5 (White mates in 5)"
 */
export function formatEvaluation(
  evaluation: { cp?: number; mate?: number },
  c: { bold: ColorFn; dim: ColorFn },
): string {
  if (evaluation.mate !== undefined) {
    const side = evaluation.mate > 0 ? 'White' : 'Black';
    const moves = Math.abs(evaluation.mate);
    return c.bold(`M${moves}`) + ` (${side} mates in ${moves})`;
  }

  if (evaluation.cp !== undefined) {
    const cp = evaluation.cp;
    const pawns = (cp / 100).toFixed(2);
    const sign = cp >= 0 ? '+' : '';
    const verbal = getEvalVerbal(cp);
    return `${sign}${pawns} ${c.dim(`(${verbal})`)}`;
  }

  return 'unknown';
}

/**
 * Get verbal description of evaluation
 */
export function getEvalVerbal(cp: number): string {
  const absCp = Math.abs(cp);
  const side = cp >= 0 ? 'White' : 'Black';

  if (absCp < 25) return 'Equal';
  if (absCp < 75) return `Slight edge ${side}`;
  if (absCp < 150) return `${side} better`;
  if (absCp < 300) return `${side} much better`;
  if (absCp < 500) return `${side} winning`;
  return `${side} winning decisively`;
}

/**
 * Format a sequence of moves for display
 * Shows last 4 moves to keep it readable
 */
export function formatMoveSequence(moves: string[]): string {
  if (moves.length === 0) return '';
  return moves.slice(-4).join(' ');
}

/**
 * Get human-readable NAG meaning
 */
export function getNagMeaning(nag: string): string {
  const meanings: Record<string, string> = {
    $1: '!',
    $2: '?',
    $3: '!!',
    $4: '??',
    $5: '!?',
    $6: '?!',
    $10: '=',
    $13: 'unclear',
    $14: '+=',
    $15: '=+',
    $16: '±',
    $17: '∓',
    $18: '+-',
    $19: '-+',
  };
  return meanings[nag] ?? '';
}

/**
 * Print ASCII board representation to stderr
 */
export function printAsciiBoard(fen: string, indent: string = ''): void {
  const pieces: Record<string, string> = {
    K: 'K',
    Q: 'Q',
    R: 'R',
    B: 'B',
    N: 'N',
    P: 'P',
    k: 'k',
    q: 'q',
    r: 'r',
    b: 'b',
    n: 'n',
    p: 'p',
  };

  const boardPart = fen.split(' ')[0];
  if (!boardPart) return;

  const rows = boardPart.split('/');
  for (const row of rows) {
    let line = '';
    for (const char of row) {
      if (char >= '1' && char <= '8') {
        line += '. '.repeat(parseInt(char, 10));
      } else {
        line += (pieces[char] ?? '?') + ' ';
      }
    }
    process.stderr.write(`${indent}${line.trim()}\n`);
  }
}

/**
 * Format token count for display (e.g., "1.5K", "2.3M")
 */
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(2)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

/**
 * Format cost in dollars
 */
export function formatCost(cost: number): string {
  if (cost < 0.0001) {
    return '< $0.0001';
  }
  return `$${cost.toFixed(4)}`;
}
