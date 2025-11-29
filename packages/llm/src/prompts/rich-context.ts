/**
 * Rich context formatting for agentic annotation
 */

import type { MoveClassification, MoveAnalysis } from '@chessbeast/core';

/**
 * Deep analysis data for a position
 */
export interface DeepAnalysis {
  evaluation: number; // centipawns
  bestMove: string;
  principalVariation: string[];
  depth: number;
}

/**
 * Rich context for agentic annotation
 */
export interface RichPositionContext {
  // Position info
  fen: string;
  moveNumber: number;
  movePlayed: string;
  isWhiteMove: boolean;

  // Pre-computed analysis
  currentAnalysis: DeepAnalysis;
  previousAnalysis?: {
    evaluation: number;
    bestMove: string;
    evalSwing: number;
  };

  // Classification
  classification: {
    type: MoveClassification;
    centipawnLoss: number;
    criticalScore: number;
  };

  // Game context
  opening?: {
    eco: string;
    name: string;
  };

  // Configuration
  targetRating?: number;
  perspective: 'white' | 'black' | 'neutral';
}

/**
 * Format evaluation as verbal description (no centipawns)
 * This avoids leaking numeric evaluations into the LLM context
 *
 * @param cp - Centipawn evaluation (from side-to-move's perspective)
 * @param isWhiteToMove - Whose turn it is (to correctly interpret the sign)
 */
function formatEvalVerbal(cp: number | undefined, isWhiteToMove: boolean): string {
  if (cp === undefined) return 'unclear';

  const abs = Math.abs(cp);
  // Side-to-move perspective: positive = side to move is better
  const side = (cp > 0) === isWhiteToMove ? 'White' : 'Black';

  if (abs < 25) return 'equal';
  if (abs < 50) return `${side} has a slight edge`;
  if (abs < 100) return `${side} is slightly better`;
  if (abs < 200) return `${side} has a clear advantage`;
  if (abs < 400) return `${side} is much better`;
  if (abs < 700) return `${side} is winning`;
  return `${side} has a decisive advantage`;
}

/**
 * Format move impact as verbal description
 */
function formatImpactVerbal(cpLoss: number): string {
  if (cpLoss < 30) return 'minor';
  if (cpLoss < 80) return 'notable';
  if (cpLoss < 150) return 'significant';
  if (cpLoss < 300) return 'severe';
  return 'critical';
}

/**
 * Format critical score as importance level
 */
function formatImportance(score: number): string {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

/**
 * Format move classification for display
 */
function formatClassification(type: MoveClassification): string {
  const labels: Record<MoveClassification, string> = {
    book: 'Book',
    forced: 'Forced',
    excellent: 'Excellent',
    good: 'Good',
    inaccuracy: 'Inaccuracy',
    mistake: 'Mistake',
    blunder: 'Blunder',
    brilliant: 'Brilliant',
  };
  return labels[type] || type.toUpperCase();
}

/**
 * Format principal variation for display
 */
function formatPV(pv: string[], startMoveNumber: number, isWhiteMove: boolean): string {
  if (pv.length === 0) return 'N/A';

  const moves: string[] = [];
  let moveNum = startMoveNumber;
  let isWhite = isWhiteMove;

  for (const move of pv.slice(0, 5)) {
    // 5 moves max
    if (isWhite) {
      moves.push(`${moveNum}. ${move}`);
    } else {
      if (moves.length === 0) {
        moves.push(`${moveNum}... ${move}`);
      } else {
        moves.push(move);
      }
      moveNum++;
    }
    isWhite = !isWhite;
  }

  return moves.join(' ');
}

/**
 * Format rich context for LLM prompt
 */
export function formatRichContext(ctx: RichPositionContext): string {
  const moveNotation = `${ctx.moveNumber}${ctx.isWhiteMove ? '.' : '...'} ${ctx.movePlayed}`;

  const sections: string[] = [];

  // Header
  sections.push(`## Position Analysis: ${moveNotation}`);
  sections.push(`FEN: ${ctx.fen}`);
  sections.push('');

  // Position assessment
  // currentAnalysis.evaluation is from opponent's perspective (after move was played)
  sections.push(`### Position Assessment (Depth ${ctx.currentAnalysis.depth})`);
  sections.push(`- Assessment: ${formatEvalVerbal(ctx.currentAnalysis.evaluation, !ctx.isWhiteMove)}`);
  sections.push(`- Best move was: ${ctx.currentAnalysis.bestMove}`);
  sections.push(
    `- Principal variation: ${formatPV(ctx.currentAnalysis.principalVariation, ctx.moveNumber + (ctx.isWhiteMove ? 0 : 1), !ctx.isWhiteMove)}`,
  );
  sections.push('');

  // Comparison with previous position
  if (ctx.previousAnalysis) {
    // previousAnalysis.evaluation is from player's perspective (before move was played)
    sections.push('### Position Change');
    sections.push(`- Previous assessment: ${formatEvalVerbal(ctx.previousAnalysis.evaluation, ctx.isWhiteMove)}`);
    sections.push(`- Expected move: ${ctx.previousAnalysis.bestMove || 'N/A'}`);
    sections.push(`- Impact: ${formatImpactVerbal(ctx.classification.centipawnLoss)}`);
    sections.push('');
  }

  // Classification
  sections.push('### Move Classification');
  sections.push(`- Type: ${formatClassification(ctx.classification.type)}`);
  sections.push(`- Importance: ${formatImportance(ctx.classification.criticalScore)}`);
  sections.push('');

  // Opening context
  if (ctx.opening) {
    sections.push('### Opening');
    sections.push(`${ctx.opening.eco} - ${ctx.opening.name}`);
    sections.push('');
  }

  // Configuration
  sections.push('### Annotation Settings');
  if (ctx.targetRating) {
    sections.push(`- Target audience: ~${ctx.targetRating} Elo`);
  }
  const perspectiveDesc =
    ctx.perspective === 'neutral'
      ? 'Neutral (refer to White/Black)'
      : ctx.perspective === 'white'
        ? "White's perspective (use we/they)"
        : "Black's perspective (use we/they)";
  sections.push(`- Perspective: ${perspectiveDesc}`);
  sections.push('');

  // Instructions
  sections.push('---');
  sections.push(
    'Analyze this position and generate a helpful annotation. You can use the available tools to:',
  );
  sections.push('- `evaluate_position`: Explore alternative lines or verify your analysis');
  sections.push(
    '- `predict_human_moves`: Check what moves humans at various ratings would consider',
  );
  sections.push('- `find_reference_games`: Find how master players handled this position');
  sections.push('- `make_move`: Test "what if" scenarios');
  sections.push('');
  sections.push(
    'Your final response must be a JSON object with "comment" (string) and "nags" (array of NAG numbers).',
  );

  return sections.join('\n');
}

/**
 * Build rich context from move analysis and analysis data
 */
export function buildRichContext(
  move: MoveAnalysis,
  currentAnalysis: DeepAnalysis,
  previousAnalysis: DeepAnalysis | undefined,
  targetRating: number | undefined,
  perspective: 'white' | 'black' | 'neutral',
  interestingnessScore: number,
  opening?: { eco: string; name: string },
): RichPositionContext {
  const ctx: RichPositionContext = {
    fen: move.fenBefore,
    moveNumber: move.moveNumber,
    movePlayed: move.san,
    isWhiteMove: move.isWhiteMove,
    currentAnalysis,
    classification: {
      type: move.classification,
      centipawnLoss: move.cpLoss,
      criticalScore: interestingnessScore,
    },
    perspective,
  };

  if (targetRating !== undefined) {
    ctx.targetRating = targetRating;
  }

  if (previousAnalysis) {
    ctx.previousAnalysis = {
      evaluation: previousAnalysis.evaluation,
      bestMove: previousAnalysis.bestMove,
      evalSwing: Math.abs(currentAnalysis.evaluation - previousAnalysis.evaluation),
    };
  }

  if (opening) {
    ctx.opening = opening;
  }

  return ctx;
}
