/**
 * Prompt templates for generating annotations
 *
 * Design principles:
 * - NEVER include move notation in prompts (already shown with NAG)
 * - NEVER include evaluation numbers (we don't want them in output)
 * - NEVER include classification text when NAG present (glyph shows it)
 * - Always include strict word limits
 * - Always detect and mention mate-in-X situations
 */

import type { GameAnalysis, MoveAnalysis, CriticalMoment } from '@chessbeast/core';

/**
 * Verbosity level for annotations
 */
export type VerbosityLevel = 'brief' | 'normal' | 'detailed';

/**
 * Annotation perspective (whose point of view)
 */
export type AnnotationPerspective = 'white' | 'black' | 'neutral';

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
  /** Annotation perspective (white, black, or neutral) */
  perspective: AnnotationPerspective;
  /** Whether a NAG glyph will be shown (to avoid redundant classification language) */
  hasNag: boolean;
}

/**
 * Get word limit based on verbosity and whether it's a critical moment
 */
function getWordLimit(verbosity: VerbosityLevel, isCritical: boolean): number {
  if (!isCritical) {
    return verbosity === 'detailed' ? 15 : 10;
  }
  switch (verbosity) {
    case 'brief':
      return 15;
    case 'normal':
      return 25;
    case 'detailed':
      return 40;
  }
}

/**
 * Check if there's a mate available and format it
 */
function getMateInfo(
  evalBefore: { cp?: number; mate?: number },
  evalAfter: { cp?: number; mate?: number },
): string | undefined {
  // Check if mate was available before the move (missed mate)
  if (evalBefore.mate !== undefined && Math.abs(evalBefore.mate) <= 10) {
    return `Mate in ${Math.abs(evalBefore.mate)} was available`;
  }
  // Check if mate is now available after the move
  if (evalAfter.mate !== undefined && Math.abs(evalAfter.mate) <= 10) {
    return `Mate in ${Math.abs(evalAfter.mate)} now`;
  }
  return undefined;
}

/**
 * Build prompt for critical moment annotation
 *
 * Redesigned to:
 * - NOT include move notation (already shown in PGN with NAG)
 * - NOT include evaluation numbers (we don't want them in output)
 * - NOT include classification text when NAG present
 * - Include strict word limits
 * - Detect and mention mate situations
 */
export function buildCriticalMomentPrompt(context: CommentContext): string {
  const { move, criticalMoment, targetRating, verbosity, legalMoves, openingName } = context;
  const parts: string[] = [];

  // Position context (FEN for understanding, not for repeating)
  parts.push(`POSITION: ${move.fenBefore}`);

  // Mate detection - critical for user to know
  const mateInfo = getMateInfo(move.evalBefore, move.evalAfter);
  if (mateInfo) {
    parts.push(`MATE SITUATION: ${mateInfo}`);
  }

  // Best move if different from played move (without evals)
  if (move.bestMove !== move.san) {
    parts.push(`BETTER MOVE: ${move.bestMove}`);
  }

  // Opening context if relevant
  if (openingName) {
    parts.push(`OPENING: ${openingName}`);
  }

  // Critical moment context (type only, reason helps LLM focus)
  if (criticalMoment) {
    parts.push(`SITUATION: ${criticalMoment.reason}`);
  }

  // Alternative moves (just the moves, no evals)
  if (move.alternatives && move.alternatives.length > 0) {
    const alts = move.alternatives.slice(0, 2).map((a) => a.san);
    parts.push(`OTHER OPTIONS: ${alts.join(', ')}`);
  }

  // Legal moves for hallucination prevention
  parts.push(
    `LEGAL MOVES: ${legalMoves.slice(0, 15).join(', ')}${legalMoves.length > 15 ? '...' : ''}`,
  );

  // Target rating context
  parts.push(`TARGET RATING: ${targetRating}`);

  // Perspective handling
  if (context.perspective !== 'neutral') {
    const side = context.perspective === 'white' ? 'White' : 'Black';
    const isOurMove =
      (context.move.isWhiteMove && context.perspective === 'white') ||
      (!context.move.isWhiteMove && context.perspective === 'black');
    parts.push(`PERSPECTIVE: ${side}'s view (${isOurMove ? 'our move' : "opponent's move"})`);
  }

  // Word limit - strict
  const wordLimit = getWordLimit(verbosity, true);
  parts.push('');
  parts.push(`INSTRUCTIONS: Explain WHY this move matters in UNDER ${wordLimit} WORDS.`);
  parts.push(`- Focus on the tactic/idea, not the move quality label`);
  parts.push(`- If mate exists, mention it with the key move`);
  parts.push(`- NO evaluation numbers (+1.5, -0.3, etc.)`);
  parts.push(`- NO phrases like "This is a blunder/mistake"`);

  parts.push('');
  parts.push('Respond with JSON: { "comment": "your annotation" }');

  return parts.join('\n');
}

/**
 * Build prompt for non-critical move annotation (brief)
 *
 * For non-critical moves, we want very minimal annotations.
 * Most non-critical moves should have NO comment at all.
 */
export function buildBriefMovePrompt(context: CommentContext): string {
  const { move, targetRating, legalMoves, verbosity } = context;
  const parts: string[] = [];

  parts.push(`POSITION: ${move.fenBefore}`);

  // Legal moves for hallucination prevention
  parts.push(
    `LEGAL MOVES: ${legalMoves.slice(0, 10).join(', ')}${legalMoves.length > 10 ? '...' : ''}`,
  );

  parts.push(`TARGET RATING: ${targetRating}`);

  // Perspective handling
  if (context.perspective !== 'neutral') {
    const side = context.perspective === 'white' ? 'White' : 'Black';
    parts.push(`PERSPECTIVE: ${side}'s view`);
  }

  // Word limit - very strict for non-critical
  const wordLimit = getWordLimit(verbosity, false);
  parts.push('');
  parts.push(`INSTRUCTIONS: Only comment if truly noteworthy. UNDER ${wordLimit} WORDS.`);
  parts.push('- Return empty string if nothing important to say');
  parts.push('- NO evaluation numbers');
  parts.push('- NO "good move" / "solid move" filler');

  parts.push('');
  parts.push('Respond with JSON: { "comment": "annotation or empty string" }');

  return parts.join('\n');
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
