/**
 * Game summary generation for the post-write annotation pipeline.
 *
 * One LLM call per game producing a short plain-text summary rendered as the
 * PGN game comment. Falls back to a deterministic template when no client is
 * available or the call fails, so a summary is never silently dropped.
 */

import type { GameAnalysis } from '@chessbeast/core';

import type { OpenAIClient } from '../client/openai-client.js';

import type { AudienceLevel } from './narrator.js';

/**
 * Configuration for game summary generation
 */
export interface GameSummaryConfig {
  /** Target audience level (controls vocabulary and lesson depth) */
  audience: AudienceLevel;

  /** Target audience rating (used to pitch the lessons) */
  targetRating: number;

  /** Temperature for LLM generation */
  temperature: number;

  /** Maximum tokens for the summary call */
  maxTokens: number;
}

/**
 * Default game summary configuration
 */
export const DEFAULT_GAME_SUMMARY_CONFIG: GameSummaryConfig = {
  audience: 'club',
  targetRating: 1500,
  temperature: 0.7,
  maxTokens: 1500,
};

const SUMMARY_SYSTEM_PROMPT = `You are a chess coach writing a short game summary that will appear at the top of an annotated game.

Guidelines:
- Write 3 to 5 sentences of flowing prose (no headings, no lists, no markdown)
- Name the opening if known, describe how the game was decided, and end with the single most useful lesson
- Show ideas rather than quoting engine numbers
- Use chess notation correctly (e.g., Nf3, O-O, exd5)

Output only the summary text.`;

/**
 * Build the user prompt for the summary call
 */
function buildSummaryPrompt(analysis: GameAnalysis, config: GameSummaryConfig): string {
  const { metadata, criticalMoments, stats } = analysis;

  const keyMoments = criticalMoments
    .slice()
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

  return `Summarize this chess game for a ${config.targetRating}-rated (${config.audience}) player.

GAME INFO:
White: ${metadata.white}${metadata.whiteElo ? ` (${metadata.whiteElo})` : ''}
Black: ${metadata.black}${metadata.blackElo ? ` (${metadata.blackElo})` : ''}
Result: ${metadata.result}
Opening: ${metadata.openingName ?? metadata.eco ?? 'Unknown'}

STATISTICS:
Total moves: ${stats.totalMoves}
White: ${stats.white.blunders} blunders, ${stats.white.mistakes} mistakes, ${stats.white.inaccuracies} inaccuracies (accuracy ${stats.white.accuracy.toFixed(1)}%)
Black: ${stats.black.blunders} blunders, ${stats.black.mistakes} mistakes, ${stats.black.inaccuracies} inaccuracies (accuracy ${stats.black.accuracy.toFixed(1)}%)

KEY MOMENTS:
${keyMoments || '- None detected'}`;
}

/**
 * Build a deterministic template summary (no LLM)
 */
export function buildTemplateSummary(analysis: GameAnalysis): string {
  const { metadata, stats } = analysis;
  const parts: string[] = [];

  if (metadata.openingName) {
    parts.push(`The game featured the ${metadata.openingName}.`);
  }

  const resultText =
    metadata.result === '1-0'
      ? 'White won'
      : metadata.result === '0-1'
        ? 'Black won'
        : metadata.result === '1/2-1/2'
          ? 'The game was drawn'
          : 'The game ended';
  const totalErrors =
    stats.white.blunders + stats.white.mistakes + stats.black.blunders + stats.black.mistakes;
  const fightText =
    totalErrors === 0
      ? 'in a cleanly played game'
      : totalErrors <= 2
        ? 'in a well-fought game decided by a few key moments'
        : 'in a sharp struggle with chances for both sides';
  parts.push(`${resultText} after ${stats.totalMoves} moves ${fightText}.`);

  parts.push(
    `White played at ${stats.white.accuracy.toFixed(1)}% accuracy, Black at ${stats.black.accuracy.toFixed(1)}%.`,
  );

  return parts.join(' ');
}

/**
 * Clean up the LLM output into a single-paragraph summary
 */
function cleanSummary(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .trim();
}

/**
 * Generate a game summary.
 *
 * Uses the LLM when a client is provided; otherwise (or on any failure)
 * returns the deterministic template summary.
 */
export async function generateGameSummary(
  client: OpenAIClient | undefined,
  analysis: GameAnalysis,
  config: Partial<GameSummaryConfig> = {},
  onWarning: (message: string) => void = console.warn,
): Promise<string> {
  const fullConfig: GameSummaryConfig = { ...DEFAULT_GAME_SUMMARY_CONFIG, ...config };

  if (!client) {
    return buildTemplateSummary(analysis);
  }

  try {
    const response = await client.chat({
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: buildSummaryPrompt(analysis, fullConfig) },
      ],
      temperature: fullConfig.temperature,
      maxTokens: fullConfig.maxTokens,
    });

    const summary = cleanSummary(response.content);
    if (summary.length === 0) {
      onWarning('Game summary came back empty, using template summary');
      return buildTemplateSummary(analysis);
    }
    return summary;
  } catch (error) {
    onWarning(
      `Game summary generation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    return buildTemplateSummary(analysis);
  }
}
