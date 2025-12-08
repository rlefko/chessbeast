/**
 * Move Assessment Artifact
 *
 * Immutable artifact linking a parent position to a child position via a move.
 * Contains evaluation deltas, NAGs, and pedagogical severity.
 */

import type { BaseArtifact } from './base.js';

/**
 * Assessment severity for pedagogical purposes
 */
export type AssessmentSeverity = 'critical' | 'significant' | 'minor' | 'neutral';

/**
 * NAG (Numeric Annotation Glyph) codes
 *
 * Move NAGs:
 * - $1 = ! (good move)
 * - $2 = ? (mistake)
 * - $3 = !! (brilliant move)
 * - $4 = ?? (blunder)
 * - $5 = !? (interesting move)
 * - $6 = ?! (dubious move)
 *
 * Position NAGs:
 * - $10 = = (equal position)
 * - $13 = ∞ (unclear position)
 * - $14 = += (slight advantage white)
 * - $15 = =+ (slight advantage black)
 * - $16 = ± (clear advantage white)
 * - $17 = ∓ (clear advantage black)
 * - $18 = +- (winning advantage white)
 * - $19 = -+ (winning advantage black)
 */
export type MoveNag = '$1' | '$2' | '$3' | '$4' | '$5' | '$6' | '$8';
export type PositionNag = '$10' | '$13' | '$14' | '$15' | '$16' | '$17' | '$18' | '$19';

/**
 * Human-readable NAG symbols
 */
export const NAG_SYMBOLS: Record<string, string> = {
  $1: '!',
  $2: '?',
  $3: '!!',
  $4: '??',
  $5: '!?',
  $6: '?!',
  $8: '□',
  $10: '=',
  $13: '∞',
  $14: '+=',
  $15: '=+',
  $16: '±',
  $17: '∓',
  $18: '+-',
  $19: '-+',
};

/**
 * Convert NAG code to symbol
 */
export function nagToSymbol(nag: string): string {
  return NAG_SYMBOLS[nag] ?? nag;
}

/**
 * Move classification tags
 */
export type MoveTag =
  | 'blunder'
  | 'mistake'
  | 'inaccuracy'
  | 'good'
  | 'excellent'
  | 'brilliant'
  | 'forced'
  | 'book'
  | 'tactical'
  | 'strategic'
  | 'simplifying'
  | 'defensive'
  | 'aggressive';

/**
 * Immutable move assessment artifact
 *
 * Links a parent position to a child position via a move,
 * containing evaluation deltas and pedagogical information.
 */
export interface MoveAssessmentArtifact extends BaseArtifact {
  readonly kind: 'move_assessment';

  /** Position before the move */
  readonly parentPositionKey: string;

  /** The move in UCI notation */
  readonly moveUci: string;

  /** The move in SAN notation */
  readonly moveSan: string;

  /** Position after the move */
  readonly childPositionKey: string;

  /** Win probability delta (negative = lost winning chances) */
  readonly winProbDelta: number;

  /** Centipawn delta (negative = position worsened) */
  readonly cpDelta: number;

  /** Centipawn loss (absolute value of negative delta) */
  readonly cpLoss: number;

  /** Assigned NAG (e.g., "$1", "$4") */
  readonly nag: string;

  /** NAG symbol for display */
  readonly nagSymbol: string;

  /** Classification tags */
  readonly tags: MoveTag[];

  /** Pedagogical severity */
  readonly severity: AssessmentSeverity;

  /** Brief assessment reason */
  readonly reason?: string;

  /** Best move in the position (if different from played move) */
  readonly bestMove?: string;

  /** Evaluation of best move */
  readonly bestMoveEval?: number;
}

/**
 * Calculate severity from cp loss and tags
 */
export function calculateSeverity(cpLoss: number, tags: MoveTag[]): AssessmentSeverity {
  if (tags.includes('blunder')) return 'critical';
  if (tags.includes('mistake') || cpLoss >= 150) return 'significant';
  if (tags.includes('inaccuracy') || cpLoss >= 50) return 'minor';
  return 'neutral';
}

/**
 * Determine NAG from cp loss and classification
 */
export function determineNag(cpLoss: number, tags: MoveTag[]): string {
  if (tags.includes('brilliant')) return '$3';
  if (tags.includes('excellent') || tags.includes('good')) return '$1';
  if (tags.includes('blunder')) return '$4';
  if (tags.includes('mistake')) return '$2';
  if (tags.includes('inaccuracy')) return '$6';
  if (tags.includes('forced')) return '$8';

  // Fallback based on cp loss
  if (cpLoss >= 300) return '$4';
  if (cpLoss >= 150) return '$2';
  if (cpLoss >= 50) return '$6';

  return '';
}

/**
 * Create a move assessment artifact
 */
export function createMoveAssessmentArtifact(
  parentPositionKey: string,
  childPositionKey: string,
  moveUci: string,
  moveSan: string,
  evalBefore: number,
  evalAfter: number,
  winProbBefore: number,
  winProbAfter: number,
  tags: MoveTag[],
  options?: {
    bestMove?: string;
    bestMoveEval?: number;
    reason?: string;
  },
): MoveAssessmentArtifact {
  // evalAfter is from opponent's perspective, so negate for comparison
  const cpDelta = evalBefore - -evalAfter;
  const cpLoss = Math.max(0, -cpDelta);
  const winProbDelta = winProbAfter - winProbBefore;

  const nag = determineNag(cpLoss, tags);
  const severity = calculateSeverity(cpLoss, tags);

  const artifact: MoveAssessmentArtifact = {
    kind: 'move_assessment',
    positionKey: parentPositionKey,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,

    parentPositionKey,
    moveUci,
    moveSan,
    childPositionKey,

    winProbDelta,
    cpDelta,
    cpLoss,

    nag,
    nagSymbol: nagToSymbol(nag),
    tags,
    severity,
  };

  if (options?.reason !== undefined) {
    (artifact as { reason: string }).reason = options.reason;
  }
  if (options?.bestMove !== undefined) {
    (artifact as { bestMove: string }).bestMove = options.bestMove;
  }
  if (options?.bestMoveEval !== undefined) {
    (artifact as { bestMoveEval: number }).bestMoveEval = options.bestMoveEval;
  }

  return artifact;
}

/**
 * Check if a move assessment indicates a critical moment
 */
export function isCriticalMoment(assessment: MoveAssessmentArtifact): boolean {
  return (
    assessment.severity === 'critical' ||
    assessment.severity === 'significant' ||
    assessment.tags.includes('brilliant') ||
    assessment.tags.includes('tactical')
  );
}

/**
 * Get a human-readable assessment summary
 */
export function getAssessmentSummary(assessment: MoveAssessmentArtifact): string {
  if (assessment.tags.includes('brilliant')) {
    return `Brilliant move! ${assessment.reason ?? ''}`;
  }
  if (assessment.tags.includes('blunder')) {
    return `Blunder - loses ${assessment.cpLoss}cp. ${assessment.reason ?? ''}`;
  }
  if (assessment.tags.includes('mistake')) {
    return `Mistake - loses ${assessment.cpLoss}cp. ${assessment.reason ?? ''}`;
  }
  if (assessment.tags.includes('inaccuracy')) {
    return `Inaccuracy - loses ${assessment.cpLoss}cp. ${assessment.reason ?? ''}`;
  }
  if (assessment.tags.includes('excellent') || assessment.tags.includes('good')) {
    return `Good move. ${assessment.reason ?? ''}`;
  }
  if (assessment.tags.includes('forced')) {
    return `Forced move. ${assessment.reason ?? ''}`;
  }
  return assessment.reason ?? '';
}
