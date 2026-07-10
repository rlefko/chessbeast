/**
 * Tests for redundancy detection and filtering
 */

import { describe, it, expect } from 'vitest';

import { createIdeaTracker } from '../memory/idea-tracker.js';
import type { CommentIntent } from '../narration/intents.js';
import type { RedundancyFilterResult } from '../narration/redundancy.js';
import {
  calculateBatchRedundancy,
  createRedundancyFilter,
  findFreshestIdeas,
  isIdeaRedundant,
  mergeRedundancyResults,
} from '../narration/redundancy.js';
import type { IdeaKey } from '../themes/idea-keys.js';
import { createIdeaKeySet } from '../themes/idea-keys.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function makeIdeaKey(concept: string): IdeaKey {
  return {
    key: `tactic:${concept}:e5:w`,
    type: 'tactic',
    concept,
    instance: 'e5',
    beneficiary: 'w',
  };
}

function makeIntent(
  plyIndex: number,
  ideaKeys: IdeaKey[],
  options?: { mandatory?: boolean; priority?: number },
): CommentIntent {
  const priority = options?.priority ?? 0.5;
  return {
    type: 'strategic_plan',
    plyIndex,
    priority,
    mandatory: options?.mandatory ?? false,
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
      ideaKeys,
    },
  };
}

describe('RedundancyFilter', () => {
  it('includes a fresh idea and filters the same idea repeated a few plies later', () => {
    const fork = makeIdeaKey('fork');
    const filter = createRedundancyFilter();

    const result = filter.filter([makeIntent(5, [fork]), makeIntent(7, [fork])]);

    expect(result.includedIntents.map((i) => i.plyIndex)).toEqual([5]);
    expect(result.filteredIntents.map((i) => i.plyIndex)).toEqual([7]);
    expect(result.briefReferenceIntents).toHaveLength(0);
  });

  it('records a recent_explanation reason with the previous ply', () => {
    const fork = makeIdeaKey('fork');
    const filter = createRedundancyFilter();

    const result = filter.filter([makeIntent(5, [fork]), makeIntent(7, [fork])]);

    const reason = result.filterReasons.get(7);
    expect(reason?.type).toBe('recent_explanation');
    expect(reason?.previousPly).toBe(5);
    expect(reason?.redundancyScore).toBeGreaterThan(0);
  });

  it('downgrades a repeated idea to a brief reference at the configured ply distance', () => {
    // minPlyGapForReexplain default is 15: at exactly 15 plies the idea is no
    // longer skipped but becomes a brief reference.
    const fork = makeIdeaKey('fork');
    const filter = createRedundancyFilter();

    const result = filter.filter([makeIntent(0, [fork]), makeIntent(15, [fork])]);

    expect(result.includedIntents.map((i) => i.plyIndex)).toEqual([0]);
    expect(result.briefReferenceIntents.map((i) => i.plyIndex)).toEqual([15]);
    expect(result.filteredIntents).toHaveLength(0);
    expect(result.stats.briefReferenceCount).toBe(1);
  });

  it('re-allows a full explanation once relevance has decayed far enough', () => {
    const fork = makeIdeaKey('fork');
    const filter = createRedundancyFilter();

    // 40 plies later: 0.96^40 ~ 0.195 < minRelevance 0.3, so fully fresh again
    const result = filter.filter([makeIntent(0, [fork]), makeIntent(40, [fork])]);

    expect(result.includedIntents.map((i) => i.plyIndex)).toEqual([0, 40]);
    expect(result.briefReferenceIntents).toHaveLength(0);
    expect(result.filteredIntents).toHaveLength(0);
  });

  it('never skips mandatory intents, downgrading them to brief references instead', () => {
    const fork = makeIdeaKey('fork');
    const filter = createRedundancyFilter();

    const result = filter.filter([
      makeIntent(5, [fork]),
      makeIntent(7, [fork], { mandatory: true }),
    ]);

    expect(result.filteredIntents).toHaveLength(0);
    expect(result.briefReferenceIntents.map((i) => i.plyIndex)).toEqual([7]);
  });

  it('tracks line-scoped ideas separately and reports a line-specific reason', () => {
    const fork = makeIdeaKey('fork');
    const filter = createRedundancyFilter();

    // Distance 10: penalty 0.96^10 ~ 0.665 >= 0.6, so the repeat is skipped
    const result = filter.filter([makeIntent(0, [fork]), makeIntent(10, [fork])], 'line-1');

    expect(result.includedIntents.map((i) => i.plyIndex)).toEqual([0]);
    expect(result.filteredIntents.map((i) => i.plyIndex)).toEqual([10]);
    expect(result.filterReasons.get(10)?.description).toContain('in this line');
  });

  it('includes a line-scoped repeat once its penalty decays below the max', () => {
    // Documents current behavior; arguably a bug: the line-scoped tracker
    // recommends 'skip' for any repeat with relevance >= 0.3 (no re-explain
    // window), but analyzeIntent only skips when the averaged penalty reaches
    // maxRedundancyPenalty (0.6). At 20 plies the penalty is 0.96^20 ~ 0.44,
    // so the repeat is fully re-included rather than skipped or downgraded
    // to a brief reference.
    const fork = makeIdeaKey('fork');
    const filter = createRedundancyFilter();

    const result = filter.filter([makeIntent(0, [fork]), makeIntent(20, [fork])], 'line-1');

    expect(result.includedIntents.map((i) => i.plyIndex)).toEqual([0, 20]);
    expect(result.filteredIntents).toHaveLength(0);
    expect(result.briefReferenceIntents).toHaveLength(0);
  });

  it('computes stats including the average redundancy penalty', () => {
    const fork = makeIdeaKey('fork');
    const filter = createRedundancyFilter();

    const result = filter.filter([makeIntent(5, [fork]), makeIntent(7, [fork])]);

    expect(result.stats.totalIntents).toBe(2);
    expect(result.stats.includedCount).toBe(1);
    expect(result.stats.filteredCount).toBe(1);
    expect(result.stats.briefReferenceCount).toBe(0);
    // First intent penalty 0, second 0.96^2 = 0.9216 -> average 0.4608
    expect(result.stats.averageRedundancyPenalty).toBeCloseTo(0.4608, 4);
  });
});

describe('isIdeaRedundant', () => {
  it('returns true only for keys present in the explained set', () => {
    const fork = makeIdeaKey('fork');
    const pin = makeIdeaKey('pin');
    const explained = createIdeaKeySet();
    explained.add(fork);

    expect(isIdeaRedundant(fork, 10, explained)).toBe(true);
    expect(isIdeaRedundant(pin, 10, explained)).toBe(false);
  });
});

describe('calculateBatchRedundancy', () => {
  it('returns 0 for an empty key list', () => {
    const tracker = createIdeaTracker();

    expect(calculateBatchRedundancy([], 10, tracker)).toBe(0);
  });

  it('averages penalties across fresh and stale ideas', () => {
    const fork = makeIdeaKey('fork');
    const pin = makeIdeaKey('pin');
    const tracker = createIdeaTracker({ decayRate: 0.04, reexplainThreshold: 15 });
    tracker.markExplained(fork, 0, 'game');

    // fork penalty at ply 2: relevance 0.96^2 = 0.9216; pin is fresh: 0
    expect(calculateBatchRedundancy([fork, pin], 2, tracker)).toBeCloseTo(0.4608, 4);
  });
});

describe('findFreshestIdeas', () => {
  it('returns the freshest ideas first and respects maxCount', () => {
    const fork = makeIdeaKey('fork');
    const pin = makeIdeaKey('pin');
    const tracker = createIdeaTracker({ decayRate: 0.04, reexplainThreshold: 15 });
    tracker.markExplained(fork, 0, 'game');

    expect(findFreshestIdeas([fork, pin], 2, tracker, 1)).toEqual([pin]);
    expect(findFreshestIdeas([fork, pin], 2, tracker, 2)).toEqual([pin, fork]);
  });
});

describe('mergeRedundancyResults', () => {
  function makeResult(
    included: CommentIntent[],
    filtered: CommentIntent[],
    brief: CommentIntent[],
    averagePenalty: number,
    reasons: [number, string][] = [],
  ): RedundancyFilterResult {
    const total = included.length + filtered.length + brief.length;
    return {
      includedIntents: included,
      filteredIntents: filtered,
      briefReferenceIntents: brief,
      filterReasons: new Map(
        reasons.map(([ply, description]) => [
          ply,
          { type: 'recent_explanation' as const, description, redundancyScore: 0.8 },
        ]),
      ),
      stats: {
        totalIntents: total,
        includedCount: included.length,
        filteredCount: filtered.length,
        briefReferenceCount: brief.length,
        averageRedundancyPenalty: averagePenalty,
      },
    };
  }

  it('concatenates intents and sums stats with a weighted average penalty', () => {
    const fork = makeIdeaKey('fork');
    const a = makeResult([makeIntent(1, [fork])], [makeIntent(3, [fork])], [], 0.5);
    const b = makeResult([makeIntent(5, [fork])], [], [makeIntent(7, [fork])], 0.25);

    const merged = mergeRedundancyResults([a, b]);

    expect(merged.includedIntents.map((i) => i.plyIndex)).toEqual([1, 5]);
    expect(merged.filteredIntents.map((i) => i.plyIndex)).toEqual([3]);
    expect(merged.briefReferenceIntents.map((i) => i.plyIndex)).toEqual([7]);
    expect(merged.stats.totalIntents).toBe(4);
    expect(merged.stats.includedCount).toBe(2);
    expect(merged.stats.filteredCount).toBe(1);
    expect(merged.stats.briefReferenceCount).toBe(1);
    // Weighted: (0.5 * 2 + 0.25 * 2) / 4 = 0.375
    expect(merged.stats.averageRedundancyPenalty).toBeCloseTo(0.375, 6);
  });

  it('dedupes filter reasons by ply with the later result winning', () => {
    const fork = makeIdeaKey('fork');
    const a = makeResult([], [makeIntent(3, [fork])], [], 0.5, [[3, 'first']]);
    const b = makeResult([], [makeIntent(3, [fork])], [], 0.5, [[3, 'second']]);

    const merged = mergeRedundancyResults([a, b]);

    expect(merged.filterReasons.size).toBe(1);
    expect(merged.filterReasons.get(3)?.description).toBe('second');
  });
});
