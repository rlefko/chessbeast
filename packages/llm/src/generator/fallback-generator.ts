/**
 * Template-based fallback generator for when LLM is unavailable
 */

import type {
  GameAnalysis,
  MoveAnalysis,
  CriticalMoment,
  CriticalMomentType,
  MoveClassification,
} from '@chessbeast/core';

import { formatEval } from '../prompts/templates.js';
import { classificationToNag } from '../validator/nag-validator.js';
import type { GeneratedComment, GeneratedSummary } from '../validator/output-validator.js';

/**
 * Generate a fallback comment using templates
 */
export function generateFallbackComment(
  move: MoveAnalysis,
  criticalMoment?: CriticalMoment,
): GeneratedComment {
  let comment = '';

  // Generate comment based on critical moment type
  if (criticalMoment) {
    comment = getCriticalMomentTemplate(criticalMoment, move);
  }

  // If no critical moment comment, generate based on classification
  if (!comment && move.classification !== 'good' && move.classification !== 'book') {
    comment = getClassificationTemplate(move);
  }

  // Get NAG from classification
  const nag = classificationToNag(move.classification);

  return {
    comment,
    nags: nag ? [nag] : [],
  };
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
 */
function getCriticalMomentTemplate(moment: CriticalMoment, move: MoveAnalysis): string {
  const templates: Record<CriticalMomentType, (m: MoveAnalysis, cm: CriticalMoment) => string> = {
    eval_swing: (m) => {
      const evalChange = Math.abs(m.cpLoss);
      if (evalChange >= 200) {
        return `${m.san} significantly changes the evaluation. ${m.bestMove} was much stronger.`;
      }
      return `${m.san} affects the position's evaluation.`;
    },

    result_change: () => `This move shifts the expected outcome of the game.`,

    missed_win: (m) => {
      const evalBefore = formatEval(m.evalBefore.cp, m.evalBefore.mate);
      return `A winning opportunity was missed. The position was ${evalBefore} and ${m.bestMove} would maintain the advantage.`;
    },

    missed_draw: (m) => `${m.san} misses a drawing resource. ${m.bestMove} would have held.`,

    phase_transition: () => `The game transitions to a new phase.`,

    tactical_moment: (m) => {
      if (m.classification === 'brilliant') {
        return `${m.san}! An excellent tactical decision.`;
      }
      if (m.classification === 'blunder') {
        return `${m.san} misses an important tactical opportunity.`;
      }
      return `An important tactical moment in the game.`;
    },

    turning_point: (m) => {
      if (m.cpLoss > 0) {
        return `${m.san} is the turning point where the advantage changes hands.`;
      }
      return `A critical turning point in the game.`;
    },

    time_pressure: (m) => `${m.san} was played under time pressure.`,

    blunder_recovery: (m) => {
      if (m.cpLoss > 100) {
        return `${m.san} fails to capitalize on the opponent's earlier mistake.`;
      }
      return `The position stabilizes after the earlier inaccuracy.`;
    },
  };

  return templates[moment.type]?.(move, moment) ?? moment.reason;
}

/**
 * Get template for move classifications
 */
function getClassificationTemplate(move: MoveAnalysis): string {
  const templates: Record<MoveClassification, string> = {
    blunder: `${move.san} is a serious mistake. ${move.bestMove} was much better.`,
    mistake: `${move.san} is inaccurate. ${move.bestMove} was preferable.`,
    inaccuracy: `${move.san} is slightly imprecise.`,
    brilliant: `${move.san}! An excellent find.`,
    excellent: `${move.san} is a strong move.`,
    good: '',
    book: '',
    forced: `${move.san} is essentially forced.`,
  };

  return templates[move.classification] ?? '';
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
