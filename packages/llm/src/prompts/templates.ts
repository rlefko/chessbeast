/**
 * Prompt templates for generating annotations
 */

import type { GameAnalysis, MoveAnalysis, CriticalMoment } from '@chessbeast/core';

/**
 * Verbosity level for annotations
 */
export type VerbosityLevel = 'brief' | 'normal' | 'detailed';

/**
 * Context for generating a move comment
 */
export interface CommentContext {
  /** The move analysis */
  move: MoveAnalysis;
  /** Critical moment info if applicable */
  criticalMoment: CriticalMoment | undefined;
  /** Target rating for explanation level */
  targetRating: number;
  /** Verbosity level */
  verbosity: VerbosityLevel;
  /** Legal moves from this position (to prevent hallucination) */
  legalMoves: string[];
  /** Opening name if in opening phase */
  openingName: string | undefined;
  /** Move number in standard notation (e.g., "15. Nf3" or "15...Nf6") */
  moveNotation: string;
}

/**
 * Format evaluation for human-readable display
 */
export function formatEval(cp: number | undefined, mate: number | undefined): string {
  if (mate !== undefined) {
    return mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`;
  }
  if (cp !== undefined) {
    const sign = cp >= 0 ? '+' : '';
    return `${sign}${(cp / 100).toFixed(2)}`;
  }
  return '?';
}

/**
 * Format evaluation change between moves
 */
export function formatEvalChange(before: number | undefined, after: number | undefined): string {
  if (before === undefined || after === undefined) return '';
  const diff = after - before;
  if (Math.abs(diff) < 10) return 'equal';
  const sign = diff > 0 ? '+' : '';
  return `${sign}${(diff / 100).toFixed(2)}`;
}

/**
 * Build prompt for critical moment annotation
 */
export function buildCriticalMomentPrompt(context: CommentContext): string {
  const { move, criticalMoment, targetRating, verbosity, legalMoves, openingName } = context;

  const evalBefore = formatEval(move.evalBefore.cp, move.evalBefore.mate);
  const evalAfter = formatEval(move.evalAfter.cp, move.evalAfter.mate);

  let prompt = `Analyze this chess position and the move played.

POSITION: ${move.fenBefore}
MOVE PLAYED: ${context.moveNotation}
BEST MOVE (ENGINE): ${move.bestMove}
EVALUATION: ${evalBefore} → ${evalAfter}
CP LOSS: ${move.cpLoss}
CLASSIFICATION: ${move.classification}
TARGET RATING: ${targetRating}
VERBOSITY: ${verbosity}`;

  if (openingName) {
    prompt += `\nOPENING: ${openingName}`;
  }

  if (criticalMoment) {
    prompt += `\n\nCRITICAL MOMENT TYPE: ${criticalMoment.type}`;
    prompt += `\nREASON: ${criticalMoment.reason}`;
  }

  if (move.alternatives && move.alternatives.length > 0) {
    const alts = move.alternatives
      .slice(0, 3)
      .map((a) => `- ${a.san}: ${formatEval(a.eval.cp, a.eval.mate)}`)
      .join('\n');
    prompt += `\n\nALTERNATIVES:\n${alts}`;
  }

  // Include legal moves to prevent hallucination
  prompt += `\n\nLEGAL MOVES IN THIS POSITION:\n${legalMoves.join(', ')}`;

  prompt += `\n\nProvide a ${verbosity} annotation for this move appropriate for a ${targetRating}-rated player.`;
  prompt += `\n\nRespond with JSON: { "comment": "your annotation", "nags": ["$1"] }`;
  prompt += `\nNAG codes: $1=!, $2=?, $3=!!, $4=??, $5=!?, $6=?!`;

  return prompt;
}

/**
 * Build prompt for non-critical move annotation (brief)
 */
export function buildBriefMovePrompt(context: CommentContext): string {
  const { move, targetRating, legalMoves } = context;

  const evalBefore = formatEval(move.evalBefore.cp, move.evalBefore.mate);
  const evalAfter = formatEval(move.evalAfter.cp, move.evalAfter.mate);

  return `Briefly annotate this chess move for a ${targetRating}-rated player.

POSITION: ${move.fenBefore}
MOVE: ${context.moveNotation}
EVALUATION: ${evalBefore} → ${evalAfter}
CLASSIFICATION: ${move.classification}

LEGAL MOVES: ${legalMoves.slice(0, 10).join(', ')}${legalMoves.length > 10 ? '...' : ''}

Respond with JSON: { "comment": "brief annotation or empty string", "nags": [] }
Only add a comment if noteworthy. Keep it under 20 words.`;
}

/**
 * Build prompt for game summary
 */
export function buildSummaryPrompt(analysis: GameAnalysis, targetRating: number): string {
  const { metadata, criticalMoments, stats } = analysis;

  const keyMoments = criticalMoments
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((m) => {
      const move = analysis.moves[m.plyIndex];
      const moveNum = move
        ? `${move.moveNumber}${move.isWhiteMove ? '.' : '...'} ${move.san}`
        : `Ply ${m.plyIndex}`;
      return `- ${moveNum}: ${m.reason} (${m.type})`;
    })
    .join('\n');

  return `Summarize this chess game for a ${targetRating}-rated player.

GAME INFO:
White: ${metadata.white}${metadata.whiteElo ? ` (${metadata.whiteElo})` : ''}
Black: ${metadata.black}${metadata.blackElo ? ` (${metadata.blackElo})` : ''}
Result: ${metadata.result}
Opening: ${metadata.openingName ?? metadata.eco ?? 'Unknown'}

STATISTICS:
Total moves: ${stats.totalMoves}
White: ${stats.white.blunders} blunders, ${stats.white.mistakes} mistakes, ${stats.white.inaccuracies} inaccuracies
Black: ${stats.black.blunders} blunders, ${stats.black.mistakes} mistakes, ${stats.black.inaccuracies} inaccuracies
White accuracy: ${stats.white.accuracy.toFixed(1)}%
Black accuracy: ${stats.black.accuracy.toFixed(1)}%

KEY MOMENTS:
${keyMoments}

Respond with JSON:
{
  "openingSynopsis": "Brief opening description",
  "gameNarrative": "Story of the game in 2-3 sentences",
  "keyMoments": [{"moveNumber": 15, "description": "What happened"}],
  "lessonsLearned": ["Lesson 1", "Lesson 2", "Lesson 3"]
}

Focus on lessons appropriate for a ${targetRating}-rated player.`;
}

/**
 * Build prompt for opening phase annotation
 */
export function buildOpeningPrompt(
  openingName: string,
  eco: string | undefined,
  targetRating: number,
): string {
  return `Provide a brief introduction to this chess opening for a ${targetRating}-rated player.

OPENING: ${openingName}
${eco ? `ECO: ${eco}` : ''}

Respond with JSON:
{
  "comment": "1-2 sentences about the opening's main ideas and typical plans"
}

Keep it educational and appropriate for the target rating. Don't mention specific variations unless very common.`;
}
