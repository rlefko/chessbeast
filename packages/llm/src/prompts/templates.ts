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
 * - ultra-brief: 5-8 words max (for cluttered positions or tight budgets)
 * - brief: 10-15 words max
 * - normal: 15-25 words max
 * - detailed: 25-40 words max
 */
export type VerbosityLevel = 'ultra-brief' | 'brief' | 'normal' | 'detailed';

/**
 * Annotation perspective (whose point of view)
 */
export type AnnotationPerspective = 'white' | 'black' | 'neutral';

/**
 * A planned variation that will be shown in the PGN
 */
export interface PlannedVariation {
  /** SAN moves in the variation */
  moves: string[];
  /** Purpose of the variation */
  purpose: 'best' | 'human_alternative' | 'refutation' | 'trap' | 'thematic';
  /** Source of the variation (engine, maia, or llm-suggested) */
  source: 'engine' | 'maia' | 'llm';
}

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
  /** Planned variations that will be shown in the PGN (for coherent commentary) */
  plannedVariations?: PlannedVariation[];
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
 * - Provide rich context (threats, key continuation)
 */
export function buildCriticalMomentPrompt(context: CommentContext): string {
  const { move, criticalMoment, targetRating, legalMoves, openingName } = context;
  const parts: string[] = [];

  // Position context (FEN for understanding)
  parts.push(`POSITION: ${move.fenBefore}`);

  // Mate detection - critical for user to know
  const mateInfo = getMateInfo(move.evalBefore, move.evalAfter);
  if (mateInfo) {
    parts.push(`!! MATE SITUATION: ${mateInfo} !!`);
  }

  // Best move if different from played move
  if (move.bestMove && move.bestMove !== move.san) {
    parts.push(`BEST MOVE: ${move.bestMove}`);

    // Include the key continuation line if available (expanded from 4 to 10 moves)
    if (move.alternatives && move.alternatives.length > 0) {
      const bestAlt = move.alternatives[0];
      if (bestAlt && bestAlt.eval.pv && bestAlt.eval.pv.length > 1) {
        const continuation = bestAlt.eval.pv.slice(0, 10).join(' ');
        parts.push(`KEY LINE: ${continuation}`);
      }
    }
  }

  // Include planned variations that will be shown in the PGN
  // This ensures the LLM commentary references lines that actually appear in output
  if (context.plannedVariations && context.plannedVariations.length > 0) {
    parts.push('');
    parts.push('VARIATIONS THAT WILL BE SHOWN IN PGN:');
    for (const v of context.plannedVariations) {
      const purposeLabel = v.purpose === 'human_alternative' ? 'human likely' : v.purpose;
      parts.push(`  ${v.moves.slice(0, 15).join(' ')} [${purposeLabel}]`);
    }
    parts.push('Your comment should reference these specific lines when relevant.');
  }

  // Opening context if relevant
  if (openingName) {
    parts.push(`OPENING: ${openingName}`);
  }

  // Critical moment context
  if (criticalMoment) {
    parts.push(`SITUATION: ${criticalMoment.reason}`);
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

  parts.push('');

  // Format rules - pointer style with move/concept philosophy
  parts.push('FORMAT RULES:');
  parts.push('- Brief pointer comment (5-12 words, max 50 chars)');
  parts.push('- Lowercase start, no ending punctuation');
  parts.push('- Never start with "we played", "by playing", "this is"');
  parts.push('- Never say "because" - variations show why');
  parts.push('');

  // When variations are present, emphasize conceptual language
  // The variations show the moves - comments point to concepts
  if (context.plannedVariations && context.plannedVariations.length > 0) {
    parts.push('TASK: Write a brief CONCEPTUAL pointer (5-12 words).');
    parts.push("Variations below show alternatives - don't name specific alternative moves.");
    parts.push('');
    parts.push('POINTER STYLE (conceptual, not move-specific):');
    parts.push('Strategic direction (moves OK):');
    parts.push('  - "neglects development"');
    parts.push('  - "fails to prepare the queenside expansion"');
    parts.push('');
    parts.push('Specific alternatives (concepts only - variation shows the move):');
    parts.push('  - "misses a more active piece placement"');
    parts.push('  - "overlooks better central control"');
    parts.push('');
    parts.push('Tactical blows (can name the killing move):');
    parts.push('  - "drops material after Bxf7+"');
    parts.push('  - "walks into a knight fork"');
  } else {
    parts.push('TASK: Write a brief CONCEPTUAL pointer about this position (5-12 words).');
    parts.push(
      'Focus on the strategic or tactical concept. If mate exists, can point to key move.',
    );
  }

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
  const { move, targetRating, legalMoves } = context;
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

  // Pointer style for non-critical moves
  parts.push('');
  parts.push('INSTRUCTIONS: Only comment if truly noteworthy.');
  parts.push('Return empty string if nothing important to say.');
  parts.push('If commenting, use brief pointer style (5-12 words, lowercase, no punctuation).');
  parts.push('No evaluation numbers, no headers, no bullet points.');

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
