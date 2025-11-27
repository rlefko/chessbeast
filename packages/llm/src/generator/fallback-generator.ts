/**
 * Template-based fallback generator for when LLM is unavailable
 *
 * Note: Fallback comments intentionally avoid evaluation numbers
 * since we don't want numeric evals in the output.
 */

import type {
  GameAnalysis,
  MoveAnalysis,
  CriticalMoment,
  CriticalMomentType,
} from '@chessbeast/core';

import { classificationToNag } from '../validator/nag-validator.js';
import type { GeneratedComment, GeneratedSummary } from '../validator/output-validator.js';

/**
 * Generate a fallback comment using templates
 *
 * IMPORTANT: We prefer silence over generic text. Only generate comments when
 * we have specific, actionable information to share. Generic phrases like
 * "is a strong move" or "affects the evaluation" are worse than no comment.
 */
export function generateFallbackComment(
  move: MoveAnalysis,
  criticalMoment?: CriticalMoment,
): GeneratedComment {
  // Get NAG from classification (always provide this)
  const nag = classificationToNag(move.classification);

  // Only generate text for truly critical situations with specific information
  // Otherwise, let the NAG speak for itself - silence is better than generic text
  if (!criticalMoment) {
    return { comment: undefined, nags: nag ? [nag] : [] };
  }

  // Only generate comment if we have something specific to say
  const comment = getCriticalMomentTemplate(criticalMoment, move);

  // If the template returns empty or generic text, skip it
  if (!comment || isGenericText(comment)) {
    return { comment: undefined, nags: nag ? [nag] : [] };
  }

  return {
    comment,
    nags: nag ? [nag] : [],
  };
}

/**
 * Check if text is too generic to be useful
 */
function isGenericText(text: string): boolean {
  const genericPhrases = [
    'is a strong move',
    'is a good move',
    'affects the position',
    'affects the evaluation',
    'changes the evaluation',
    'important tactical moment',
    'critical turning point',
    'transitions to a new phase',
    'An excellent find',
  ];
  return genericPhrases.some((phrase) => text.toLowerCase().includes(phrase.toLowerCase()));
}

/**
 * Generate a fallback summary using templates
 */
export function generateFallbackSummary(analysis: GameAnalysis): GeneratedSummary {
  const { metadata, stats, criticalMoments } = analysis;

  // Opening synopsis
  const openingSynopsis = metadata.openingName
    ? `The game featured the ${metadata.openingName}.`
    : undefined;

  // Game narrative based on result and stats
  const gameNarrative = generateNarrative(analysis);

  // Key moments from critical moments
  const keyMoments = criticalMoments
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((m) => {
      const move = analysis.moves[m.plyIndex];
      return {
        moveNumber: move?.moveNumber ?? Math.ceil((m.plyIndex + 1) / 2),
        description: m.reason,
      };
    });

  // Basic lessons based on stats
  const lessonsLearned = generateLessons(stats);

  return {
    openingSynopsis,
    gameNarrative,
    keyMoments,
    lessonsLearned,
  };
}

/**
 * Get template for critical moment types
 *
 * Returns empty string for generic situations - we prefer silence over vague comments.
 * Only produces text when we have something specific to say.
 */
function getCriticalMomentTemplate(moment: CriticalMoment, move: MoveAnalysis): string {
  const templates: Record<CriticalMomentType, (m: MoveAnalysis, cm: CriticalMoment) => string> = {
    eval_swing: (m) => {
      // Only comment if we have a concrete better move to suggest
      if (m.bestMove && m.cpLoss >= 100) {
        return `${m.bestMove} was stronger.`;
      }
      return ''; // Skip generic "affects evaluation" comments
    },

    result_change: () => '', // Too generic without context

    missed_win: (m) => {
      // This is specific enough - mate was missed
      if (m.evalBefore.mate !== undefined && m.evalBefore.mate > 0 && m.bestMove) {
        return `Mate was available with ${m.bestMove}.`;
      }
      if (m.bestMove) {
        return `${m.bestMove} wins.`;
      }
      return '';
    },

    missed_draw: (m) => {
      if (m.bestMove) {
        return `${m.bestMove} holds the draw.`;
      }
      return '';
    },

    phase_transition: () => '', // Too generic

    tactical_moment: (m) => {
      // Only comment if we have a concrete tactical suggestion
      if (m.classification === 'blunder' && m.bestMove) {
        return `${m.bestMove} was winning.`;
      }
      return ''; // Skip generic "tactical moment" comments
    },

    turning_point: (m) => {
      // Only if we have a concrete better move
      if (m.bestMove && m.cpLoss >= 100) {
        return `${m.bestMove} keeps the advantage.`;
      }
      return '';
    },

    time_pressure: () => '', // We don't know this without clock data

    blunder_recovery: (m) => {
      if (m.bestMove && m.cpLoss >= 100) {
        return `${m.bestMove} capitalizes on the earlier mistake.`;
      }
      return '';
    },
  };

  return templates[moment.type]?.(move, moment) ?? '';
}

/**
 * Generate game narrative based on analysis
 */
function generateNarrative(analysis: GameAnalysis): string {
  const { metadata, stats } = analysis;
  const parts: string[] = [];

  // Determine who played better
  const whiteBetter = stats.white.accuracy > stats.black.accuracy;
  const betterPlayer = whiteBetter ? metadata.white : metadata.black;

  // Describe the flow
  if (metadata.result === '1-0') {
    if (stats.black.blunders > 0) {
      parts.push(
        `${metadata.white} won after ${metadata.black}'s ${stats.black.blunders > 1 ? 'blunders' : 'blunder'}.`,
      );
    } else {
      parts.push(`${metadata.white} played accurately and converted the advantage.`);
    }
  } else if (metadata.result === '0-1') {
    if (stats.white.blunders > 0) {
      parts.push(
        `${metadata.black} won after ${metadata.white}'s ${stats.white.blunders > 1 ? 'blunders' : 'blunder'}.`,
      );
    } else {
      parts.push(`${metadata.black} played accurately and converted the advantage.`);
    }
  } else {
    const totalBlunders = stats.white.blunders + stats.black.blunders;
    if (totalBlunders > 0) {
      parts.push(`The game ended in a draw despite ${totalBlunders} blunder(s).`);
    } else {
      parts.push(`Both players played solidly, resulting in a draw.`);
    }
  }

  // Add accuracy comparison
  const accDiff = Math.abs(stats.white.accuracy - stats.black.accuracy);
  if (accDiff > 10) {
    parts.push(`${betterPlayer} played more accurately overall.`);
  }

  return parts.join(' ');
}

/**
 * Generate basic lessons from stats
 */
function generateLessons(stats: import('@chessbeast/core').GameStats): string[] {
  const lessons: string[] = [];

  // Lesson about blunders
  const totalBlunders = stats.white.blunders + stats.black.blunders;
  if (totalBlunders > 0) {
    lessons.push('Check for threats before making each move to avoid blunders.');
  }

  // Lesson about accuracy
  const avgAccuracy = (stats.white.accuracy + stats.black.accuracy) / 2;
  if (avgAccuracy < 70) {
    lessons.push('Focus on calculating variations more carefully.');
  } else if (avgAccuracy > 90) {
    lessons.push('High-quality game - review the key moments for learning.');
  }

  // Lesson about mistakes
  const totalMistakes = stats.white.mistakes + stats.black.mistakes;
  if (totalMistakes > 3) {
    lessons.push('Consider each candidate move before playing.');
  }

  // Ensure we have at least one lesson
  if (lessons.length === 0) {
    lessons.push('Analyze your games to identify patterns in your play.');
  }

  return lessons.slice(0, 3);
}
