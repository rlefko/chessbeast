/**
 * Tension resolution detection for chess variations
 *
 * Determines when a line of play is "resolved" - no immediate tactical
 * sequences pending, and the position has reached a stable state.
 */

import { ChessPosition } from './position.js';
import { detectTension } from './tension-detector.js';

/**
 * Configuration for tension resolution
 */
export interface TensionConfig {
  /** Maximum moves to continue even without resolution (default: 15) */
  maxMoves: number;
  /** Whether to continue through check sequences (default: true) */
  resolveChecks: boolean;
  /** Whether to continue through capture sequences (default: true) */
  resolveCaptures: boolean;
  /** Whether to require development in opening positions (default: true) */
  requireDevelopment: boolean;
}

const DEFAULT_TENSION_CONFIG: TensionConfig = {
  maxMoves: 40, // Increased from 15 to allow deep variations like human annotations
  resolveChecks: true,
  resolveCaptures: true,
  requireDevelopment: true,
};

/**
 * Check if a move is a capture by looking for 'x' in SAN notation
 */
function isCapture(san: string): boolean {
  return san.includes('x');
}

/**
 * Check if a move gives check by looking for '+' or '#' in SAN notation
 */
function isCheck(san: string): boolean {
  return san.includes('+') || san.includes('#');
}

/**
 * Check if position is still in the opening phase
 * Uses piece development as indicator (not just move count)
 */
function isOpeningPhase(fen: string): boolean {
  // Quick heuristic: count developed minor pieces
  // If both sides have developed at least 2 minor pieces, we're past opening
  const boardFen = fen.split(' ')[0]!;

  // Count minor pieces still on starting squares
  let whiteUndeveloped = 0;
  let blackUndeveloped = 0;

  // Check if minor pieces are on their starting squares
  // This is a simplified check - we look at the FEN board representation
  const rows = boardFen.split('/');

  // Row 1 (white's back rank, index 7 in FEN)
  const whiteBackRank = expandFenRow(rows[7] ?? '');
  if (whiteBackRank[1] === 'N') whiteUndeveloped++; // b1
  if (whiteBackRank[2] === 'B') whiteUndeveloped++; // c1
  if (whiteBackRank[5] === 'B') whiteUndeveloped++; // f1
  if (whiteBackRank[6] === 'N') whiteUndeveloped++; // g1

  // Row 8 (black's back rank, index 0 in FEN)
  const blackBackRank = expandFenRow(rows[0] ?? '');
  if (blackBackRank[1] === 'n') blackUndeveloped++; // b8
  if (blackBackRank[2] === 'b') blackUndeveloped++; // c8
  if (blackBackRank[5] === 'b') blackUndeveloped++; // f8
  if (blackBackRank[6] === 'n') blackUndeveloped++; // g8

  // Still in opening if either side has 2+ undeveloped minor pieces
  return whiteUndeveloped >= 2 || blackUndeveloped >= 2;
}

/**
 * Expand a FEN row (e.g., "rnbqkbnr" or "4P3") to 8 characters
 */
function expandFenRow(row: string): string {
  let expanded = '';
  for (const char of row) {
    if (char >= '1' && char <= '8') {
      expanded += ' '.repeat(parseInt(char, 10));
    } else {
      expanded += char;
    }
  }
  return expanded;
}

/**
 * Check if there's a likely recapture opportunity
 * (opponent just captured on a square where we can recapture)
 */
function hasRecaptureOpportunity(pos: ChessPosition, lastMoveSan: string): boolean {
  if (!isCapture(lastMoveSan)) {
    return false;
  }

  // Extract the destination square from the capture move
  // SAN captures look like: Nxe5, exd5, Bxf7+, etc.
  const destSquare = extractDestSquare(lastMoveSan);
  if (!destSquare) return false;

  // Check if any of our legal moves capture on that same square
  const legalMoves = pos.getLegalMoves();
  return legalMoves.some((move) => isCapture(move) && extractDestSquare(move) === destSquare);
}

/**
 * Extract destination square from SAN notation
 */
function extractDestSquare(san: string): string | null {
  // Remove check/mate symbols and promotion
  const cleaned = san.replace(/[+#=][QRBN]?/g, '');

  // Find the square (letter followed by number)
  const match = cleaned.match(/([a-h][1-8])$/);
  return match ? match[1]! : null;
}

/**
 * Determine how many moves to continue a variation based on tension
 *
 * @param startingFen - FEN of the position where variation starts
 * @param sanMoves - SAN moves in the variation
 * @param config - Tension resolution configuration
 * @returns Number of moves to include (at least 1)
 */
export function resolveVariationLength(
  startingFen: string,
  sanMoves: string[],
  config: Partial<TensionConfig> = {},
): number {
  const cfg = { ...DEFAULT_TENSION_CONFIG, ...config };

  if (sanMoves.length === 0) {
    return 0;
  }

  // Always include at least the first move
  if (sanMoves.length === 1) {
    return 1;
  }

  const pos = new ChessPosition(startingFen);
  let lastMove = '';
  let inCaptureSequence = false;

  for (let i = 0; i < sanMoves.length && i < cfg.maxMoves; i++) {
    const move = sanMoves[i]!;

    // Make the move to update position
    try {
      pos.move(move);
    } catch {
      // Invalid move - stop here
      return Math.max(1, i);
    }

    const isCurrentCheck = isCheck(move);
    const isCurrentCapture = isCapture(move);

    // Track capture sequences
    if (isCurrentCapture) {
      inCaptureSequence = true;
    } else if (inCaptureSequence && !hasRecaptureOpportunity(pos, lastMove)) {
      // Capture sequence ended, no recapture available
      inCaptureSequence = false;
    }

    lastMove = move;

    // Don't stop in the middle of a check
    if (cfg.resolveChecks && isCurrentCheck) {
      continue;
    }

    // Don't stop in the middle of a capture sequence
    if (cfg.resolveCaptures && inCaptureSequence) {
      continue;
    }

    // In opening, continue until development is reasonable
    if (cfg.requireDevelopment && i < 6 && isOpeningPhase(pos.fen())) {
      continue;
    }

    // Minimum depth enforcement: require at least 4 moves (2 full moves each side)
    // to show the idea properly. Previous behavior stopped after 1-2 moves.
    const MINIMUM_VARIATION_DEPTH = 4;
    if (i < MINIMUM_VARIATION_DEPTH - 1) {
      continue;
    }

    // Position is resolved - return number of moves (i+1 since 0-indexed)
    return i + 1;
  }

  // Hit max length or end of variation
  return Math.min(sanMoves.length, cfg.maxMoves);
}

/**
 * Check if a position has immediate tactical tension
 * (useful for deciding whether to extend a variation)
 */
export function hasTacticalTension(fen: string, lastMoveSan?: string): boolean {
  const pos = new ChessPosition(fen);

  // Check if in check
  if (pos.isCheck()) {
    return true;
  }

  // Check for recapture opportunity
  if (lastMoveSan && hasRecaptureOpportunity(pos, lastMoveSan)) {
    return true;
  }

  // Use comprehensive tension detection
  const tension = detectTension(pos);
  if (tension.hasTension) {
    return true;
  }

  return false;
}

/**
 * Resolution state of a position
 * Used to determine appropriate NAG and ending comment
 */
export type ResolutionState =
  | 'winning_white' // $18 territory
  | 'winning_black' // $19 territory
  | 'draw' // Stable drawn position
  | 'quiet' // No immediate tactics
  | 'unresolved'; // Still has tension

/**
 * Result of resolution state detection
 */
export interface ResolutionResult {
  /** The resolution state */
  state: ResolutionState;
  /** Appropriate NAG for this state (if any) */
  nag: string | undefined;
  /** Human-readable reason for this assessment */
  reason: string;
}

/** Thresholds for position assessment (centipawns) */
const WINNING_THRESHOLD = 300; // Decisive advantage
const SLIGHT_THRESHOLD = 50; // Clear difference from equal

/**
 * Get the resolution state of a position
 *
 * Combines tension detection with evaluation to determine
 * whether a position is "resolved" and what the appropriate
 * NAG and ending comment should be.
 *
 * @param fen - FEN of the position to assess
 * @param eval_ - Optional engine evaluation
 * @returns Resolution result with state, NAG, and reason
 */
export function getResolutionState(
  fen: string,
  eval_?: { cp?: number; mate?: number },
): ResolutionResult {
  const pos = new ChessPosition(fen);

  // Game over states
  if (pos.isCheckmate()) {
    // Whoever is to move is checkmated
    const winner = pos.turn() === 'w' ? 'Black' : 'White';
    return {
      state: winner === 'White' ? 'winning_white' : 'winning_black',
      nag: winner === 'White' ? '$18' : '$19',
      reason: 'checkmate',
    };
  }

  if (pos.isDraw()) {
    if (pos.isStalemate()) {
      return { state: 'draw', nag: '$10', reason: 'stalemate' };
    }
    return { state: 'draw', nag: '$10', reason: 'draw' };
  }

  // Check for tension
  const tension = detectTension(pos);
  if (tension.hasTension) {
    return {
      state: 'unresolved',
      nag: undefined,
      reason: tension.reasons.join('; '),
    };
  }

  // No tension - assess based on evaluation
  if (eval_?.mate !== undefined) {
    // Forced mate - decisive
    // Mate from side-to-move's perspective: positive = side to move delivers mate
    const winner =
      eval_.mate > 0
        ? pos.turn() === 'w'
          ? 'White'
          : 'Black'
        : pos.turn() === 'w'
          ? 'Black'
          : 'White';

    const moves = Math.abs(eval_.mate);
    return {
      state: winner === 'White' ? 'winning_white' : 'winning_black',
      nag: winner === 'White' ? '$18' : '$19',
      reason: moves === 1 ? 'mate' : `mate in ${moves}`,
    };
  }

  if (eval_?.cp !== undefined) {
    const cp = eval_.cp;
    // cp is from side-to-move's perspective: positive = side to move is better
    const sideToMove = pos.turn();

    if (Math.abs(cp) >= WINNING_THRESHOLD) {
      // Decisive advantage
      const winner =
        cp > 0
          ? sideToMove === 'w'
            ? 'White'
            : 'Black'
          : sideToMove === 'w'
            ? 'Black'
            : 'White';

      return {
        state: winner === 'White' ? 'winning_white' : 'winning_black',
        nag: winner === 'White' ? '$18' : '$19',
        reason: `${winner.toLowerCase()} is winning`,
      };
    }

    if (Math.abs(cp) < SLIGHT_THRESHOLD) {
      // Roughly equal
      return { state: 'quiet', nag: '$10', reason: 'equal position' };
    }

    // Clear but not decisive advantage
    const better =
      cp > 0
        ? sideToMove === 'w'
          ? 'White'
          : 'Black'
        : sideToMove === 'w'
          ? 'Black'
          : 'White';

    return {
      state: 'quiet',
      nag: better === 'White' ? '$14' : '$15', // Slight advantage
      reason: `${better.toLowerCase()} is better`,
    };
  }

  // No evaluation available - quiet position
  return { state: 'quiet', nag: undefined, reason: 'quiet position' };
}
