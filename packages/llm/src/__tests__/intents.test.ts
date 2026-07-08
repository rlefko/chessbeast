/**
 * Tests for comment intent generation and scoring
 */

import type { CriticalityScore } from '@chessbeast/core';
import { describe, it, expect } from 'vitest';

import type { CommentIntent, IntentInput } from '../narration/intents.js';
import {
  INTENT_SCORE_WEIGHTS,
  calculateIntentScore,
  createCommentIntent,
  determineIntentType,
  determineSuggestedLength,
  isMandatoryIntent,
  sortIntentsByPriority,
} from '../narration/intents.js';
import type { ThemeDelta, ThemeInstance } from '../themes/types.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function makeCriticality(score: number): CriticalityScore {
  return {
    score,
    factors: {
      winProbDelta: 0,
      cpDelta: 0,
      tacticalVolatility: 0,
      themeNovelty: 0,
      kingSafetyRisk: 0,
      repetitionPenalty: 0,
    },
    recommendedTier: 'shallow',
    reason: 'test',
  };
}

function makeTheme(overrides: Partial<ThemeInstance> = {}): ThemeInstance {
  return {
    themeKey: 'fork:e5:w',
    type: 'fork',
    category: 'tactical',
    beneficiary: 'w',
    primarySquare: 'e5',
    severity: 'significant',
    confidence: 0.9,
    confidenceLevel: 'high',
    explanation: 'Knight fork on e5',
    firstSeenPly: 10,
    lastSeenPly: 10,
    status: 'emerged',
    noveltyScore: 1,
    ...overrides,
  };
}

function makeDelta(theme: ThemeInstance, transition: ThemeDelta['transition']): ThemeDelta {
  return { theme, transition };
}

function makeInput(overrides: Partial<IntentInput> = {}): IntentInput {
  return {
    move: 'Nf3',
    fen: START_FEN,
    moveNumber: 6,
    isWhiteMove: true,
    plyIndex: 10,
    criticalityScore: makeCriticality(30),
    themeDeltas: [],
    activeThemes: [],
    explainedIdeaKeys: new Set<string>(),
    ...overrides,
  };
}

function makeIntentForSort(
  plyIndex: number,
  priority: number,
  mandatory: boolean = false,
): CommentIntent {
  return {
    type: 'strategic_plan',
    plyIndex,
    priority,
    mandatory,
    suggestedLength: 'standard',
    scoreBreakdown: {
      criticality: priority,
      themeNovelty: 0,
      instructionalValue: 0,
      redundancyPenalty: 0,
      totalScore: priority,
    },
    content: {
      move: 'Nf3',
      fen: START_FEN,
      moveNumber: Math.floor(plyIndex / 2) + 1,
      isWhiteMove: plyIndex % 2 === 0,
      ideaKeys: [],
    },
  };
}

describe('determineIntentType', () => {
  it('returns blunder_explanation for an eval swing of 300cp or more', () => {
    const input = makeInput({ evalBefore: 100, evalAfter: -250 });
    expect(determineIntentType(input)).toBe('blunder_explanation');

    // Exactly 300 also qualifies
    expect(determineIntentType(makeInput({ evalBefore: 0, evalAfter: 300 }))).toBe(
      'blunder_explanation',
    );
  });

  it('returns what_was_missed for a 150-299cp swing with a different best move', () => {
    const input = makeInput({ evalBefore: 100, evalAfter: -60, bestMove: 'Qd5' });
    expect(determineIntentType(input)).toBe('what_was_missed');

    // Exactly 150 qualifies
    expect(determineIntentType(makeInput({ evalBefore: 0, evalAfter: 150, bestMove: 'Qd5' }))).toBe(
      'what_was_missed',
    );
  });

  it('falls through when the swing move matches the best move', () => {
    const input = makeInput({ evalBefore: 100, evalAfter: -60, bestMove: 'Nf3' });
    expect(determineIntentType(input)).toBe('strategic_plan');
  });

  it('returns tactical_shot for an emerged significant tactical theme', () => {
    const input = makeInput({ themeDeltas: [makeDelta(makeTheme(), 'emerged')] });
    expect(determineIntentType(input)).toBe('tactical_shot');
  });

  it('returns theme_emergence for an emerged critical non-tactical theme', () => {
    const theme = makeTheme({
      themeKey: 'passed_pawn:a7:w',
      type: 'passed_pawn',
      category: 'structural',
      severity: 'critical',
      primarySquare: 'a7',
    });
    const input = makeInput({ themeDeltas: [makeDelta(theme, 'emerged')] });
    expect(determineIntentType(input)).toBe('theme_emergence');
  });

  it('returns theme_resolution for a resolved significant theme', () => {
    const input = makeInput({ themeDeltas: [makeDelta(makeTheme(), 'resolved')] });
    expect(determineIntentType(input)).toBe('theme_resolution');
  });

  it('returns critical_moment at criticality 70 and above', () => {
    expect(determineIntentType(makeInput({ criticalityScore: makeCriticality(70) }))).toBe(
      'critical_moment',
    );
    expect(determineIntentType(makeInput({ criticalityScore: makeCriticality(69) }))).toBe(
      'strategic_plan',
    );
  });

  it('returns why_this_move when the best move was played at criticality 40+', () => {
    expect(
      determineIntentType(makeInput({ bestMove: 'Nf3', criticalityScore: makeCriticality(40) })),
    ).toBe('why_this_move');
    expect(
      determineIntentType(makeInput({ bestMove: 'Nf3', criticalityScore: makeCriticality(39) })),
    ).toBe('strategic_plan');
  });
});

describe('isMandatoryIntent', () => {
  it('is mandatory at the 150cp eval swing boundary and not below', () => {
    expect(isMandatoryIntent(makeInput({ evalBefore: 0, evalAfter: 150 }))).toBe(true);
    expect(isMandatoryIntent(makeInput({ evalBefore: 0, evalAfter: -150 }))).toBe(true);
    expect(isMandatoryIntent(makeInput({ evalBefore: 0, evalAfter: 149 }))).toBe(false);
  });

  it('is mandatory only for emerged critical themes by default', () => {
    const critical = makeTheme({ severity: 'critical' });
    expect(isMandatoryIntent(makeInput({ themeDeltas: [makeDelta(critical, 'emerged')] }))).toBe(
      true,
    );
    // Significant severity is not in the default mandatory list
    expect(isMandatoryIntent(makeInput({ themeDeltas: [makeDelta(makeTheme(), 'emerged')] }))).toBe(
      false,
    );
    // Resolved critical themes are not mandatory (must be emerged)
    expect(isMandatoryIntent(makeInput({ themeDeltas: [makeDelta(critical, 'resolved')] }))).toBe(
      false,
    );
  });
});

describe('calculateIntentScore', () => {
  it('composes the weighted score from all factors', () => {
    const input = makeInput({
      criticalityScore: makeCriticality(100),
      themeDeltas: [makeDelta(makeTheme({ noveltyScore: 1 }), 'emerged')],
      evalBefore: 0,
      evalAfter: 300,
      bestMove: 'Qd5',
    });

    const breakdown = calculateIntentScore(input);

    expect(breakdown.criticality).toBe(1);
    expect(breakdown.themeNovelty).toBe(1);
    // 0.15 (emerged) + 0.15 (tactical) + 0.2 (swing >= 100) + 0.1 (best differs)
    expect(breakdown.instructionalValue).toBeCloseTo(0.6, 6);
    expect(breakdown.redundancyPenalty).toBe(0);

    const expected =
      INTENT_SCORE_WEIGHTS.criticality * 1 +
      INTENT_SCORE_WEIGHTS.themeNovelty * 1 +
      INTENT_SCORE_WEIGHTS.instructionalValue * 0.6 -
      INTENT_SCORE_WEIGHTS.redundancyPenalty * 0;
    expect(breakdown.totalScore).toBeCloseTo(expected, 6);
    expect(breakdown.totalScore).toBeCloseTo(0.75, 6);
  });

  it('clamps a negative weighted total to zero', () => {
    // A persisting, already-explained theme yields novelty 0.1 and a 0.25
    // redundancy penalty: 0.25*0.1 - 0.15*0.25 = -0.0125 -> clamped to 0
    const theme = makeTheme();
    const input = makeInput({
      criticalityScore: makeCriticality(0),
      themeDeltas: [makeDelta(theme, 'persisting')],
      explainedIdeaKeys: new Set([theme.themeKey]),
    });

    const breakdown = calculateIntentScore(input);

    expect(breakdown.redundancyPenalty).toBe(0.25);
    expect(breakdown.totalScore).toBe(0);
  });
});

describe('createCommentIntent', () => {
  it('carries fen and plyIndex through to the created intent', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
    const input = makeInput({
      fen,
      plyIndex: 23,
      move: 'Nf6',
      isWhiteMove: false,
      moveNumber: 12,
      evalBefore: 0,
      evalAfter: 200,
      bestMove: 'Qd5',
    });

    const intent = createCommentIntent(input);

    expect(intent).not.toBeNull();
    expect(intent?.content.fen).toBe(fen);
    expect(intent?.plyIndex).toBe(23);
    expect(intent?.content.move).toBe('Nf6');
    expect(intent?.content.moveNumber).toBe(12);
    expect(intent?.content.isWhiteMove).toBe(false);
    expect(intent?.mandatory).toBe(true);
    expect(intent?.content.bestAlternative).toBe('Qd5');
    expect(intent?.content.evalBefore).toBe(0);
    expect(intent?.content.evalAfter).toBe(200);
    expect(intent?.content.winProbDelta).toBeGreaterThan(0);
  });

  it('returns null for a non-mandatory intent below the minimum priority', () => {
    const input = makeInput({ criticalityScore: makeCriticality(10) });

    expect(createCommentIntent(input)).toBeNull();
  });
});

describe('sortIntentsByPriority', () => {
  it('puts mandatory intents first, then sorts by priority descending, stably', () => {
    const a = makeIntentForSort(1, 0.5);
    const b = makeIntentForSort(2, 0.5);
    const c = makeIntentForSort(3, 0.9);
    const d = makeIntentForSort(4, 0.1, true);
    const input = [a, b, c, d];

    const sorted = sortIntentsByPriority(input);

    expect(sorted.map((i) => i.plyIndex)).toEqual([4, 3, 1, 2]);
    // Returns a new array and does not mutate the input
    expect(input.map((i) => i.plyIndex)).toEqual([1, 2, 3, 4]);
  });
});

describe('determineSuggestedLength', () => {
  it('always uses detailed for blunders and critical moments', () => {
    expect(determineSuggestedLength('blunder_explanation', 0)).toBe('detailed');
    expect(determineSuggestedLength('critical_moment', 0)).toBe('detailed');
  });

  it('uses standard at score 0.6 and above', () => {
    expect(determineSuggestedLength('strategic_plan', 0.6)).toBe('standard');
    expect(determineSuggestedLength('why_this_move', 0.6)).toBe('standard');
  });

  it('uses standard for tactical shots regardless of score', () => {
    expect(determineSuggestedLength('tactical_shot', 0.1)).toBe('standard');
  });

  it('uses brief below 0.6 for other types', () => {
    expect(determineSuggestedLength('strategic_plan', 0.59)).toBe('brief');
    expect(determineSuggestedLength('why_this_move', 0)).toBe('brief');
  });
});
