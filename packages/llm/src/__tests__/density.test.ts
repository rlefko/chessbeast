/**
 * Tests for comment density filtering
 */

import { describe, it, expect } from 'vitest';

import type { DensityLevel } from '../narration/density.js';
import {
  DENSITY_CONFIGS,
  DensityFilter,
  calculateIdealPositions,
  compressAdjacentIntents,
  createDensityFilter,
  recommendDensityLevel,
  selectRepresentativeIntent,
} from '../narration/density.js';
import type { CommentIntent, CommentIntentType } from '../narration/intents.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface IntentOverrides {
  plyIndex: number;
  priority?: number;
  mandatory?: boolean;
  type?: CommentIntentType;
}

function makeIntent(overrides: IntentOverrides): CommentIntent {
  const priority = overrides.priority ?? 0.5;
  return {
    type: overrides.type ?? 'strategic_plan',
    plyIndex: overrides.plyIndex,
    priority,
    mandatory: overrides.mandatory ?? false,
    suggestedLength: 'standard',
    scoreBreakdown: {
      criticality: priority,
      themeNovelty: 0,
      instructionalValue: 0,
      redundancyPenalty: 0,
      totalScore: priority,
    },
    content: {
      move: 'e4',
      fen: START_FEN,
      moveNumber: Math.floor(overrides.plyIndex / 2) + 1,
      isWhiteMove: overrides.plyIndex % 2 === 0,
      ideaKeys: [],
    },
  };
}

describe('DensityFilter', () => {
  describe('max comment ratio cap', () => {
    it.each([
      ['sparse', 20, 3],
      ['normal', 20, 5],
      ['verbose', 20, 8],
    ] as [DensityLevel, number, number][])(
      'caps %s at floor(totalPlies * ratio) = %i plies -> %i comments',
      (level, totalPlies, expectedMax) => {
        expect(expectedMax).toBe(Math.floor(totalPlies * DENSITY_CONFIGS[level].maxCommentRatio));

        // Space intents far apart so only the ratio cap can filter them
        const intents = Array.from({ length: 10 }, (_, i) => makeIntent({ plyIndex: i * 10 }));
        const filter = createDensityFilter(level);

        const result = filter.filter(intents, totalPlies);

        expect(result.includedIntents).toHaveLength(expectedMax);
        expect(result.filteredIntents).toHaveLength(10 - expectedMax);
        expect(result.stats.includedCount).toBe(expectedMax);
        expect(result.stats.filteredCount).toBe(10 - expectedMax);
      },
    );

    it('reports "max comments reached" for intents over the cap', () => {
      const intents = Array.from({ length: 10 }, (_, i) => makeIntent({ plyIndex: i * 10 }));
      const filter = createDensityFilter('sparse');

      const result = filter.filter(intents, 20);

      // Intents are processed in input (priority) order, so the tail is filtered
      for (const filtered of result.filteredIntents) {
        expect(result.filterReasons.get(filtered.plyIndex)).toBe('max comments reached');
      }
    });
  });

  describe('mandatory intents', () => {
    it('bypasses the ratio cap and tallies mandatoryCount', () => {
      // totalPlies=4 with normal ratio 0.25 -> cap of 1, yet all mandatory pass
      const intents = [
        makeIntent({ plyIndex: 0, mandatory: true }),
        makeIntent({ plyIndex: 1, mandatory: true }),
        makeIntent({ plyIndex: 2, mandatory: true }),
      ];
      const filter = createDensityFilter('normal');

      const result = filter.filter(intents, 4);

      expect(result.includedIntents).toHaveLength(3);
      expect(result.filteredIntents).toHaveLength(0);
      expect(result.stats.mandatoryCount).toBe(3);
    });

    it('bypasses window and gap rules on consecutive plies', () => {
      const intents = [
        makeIntent({ plyIndex: 10, mandatory: true }),
        makeIntent({ plyIndex: 11, mandatory: true }),
        makeIntent({ plyIndex: 12, mandatory: true }),
      ];
      const filter = createDensityFilter('sparse');

      const result = filter.filter(intents, 100);

      expect(result.includedIntents.map((i) => i.plyIndex)).toEqual([10, 11, 12]);
      expect(result.stats.densityViolations).toBe(0);
    });

    it('still occupies the window against later non-mandatory intents', () => {
      const intents = [
        makeIntent({ plyIndex: 4, mandatory: true }),
        makeIntent({ plyIndex: 5, mandatory: true }),
        // High priority bypasses the gap check but not the window check
        makeIntent({ plyIndex: 6, priority: 0.9 }),
      ];
      const filter = createDensityFilter('normal');

      const result = filter.filter(intents, 40);

      expect(result.includedIntents.map((i) => i.plyIndex)).toEqual([4, 5]);
      expect(result.filterReasons.get(6)).toBe('window density exceeded (2/2)');
    });
  });

  describe('window density', () => {
    it('allows maxCommentsPerWindow comments then filters the next one in the window', () => {
      // normal: maxCommentsPerWindow=2, windowSize=3. Priority 0.9 >= threshold 0.7
      // bypasses the gap check, isolating the window check.
      const intents = [
        makeIntent({ plyIndex: 10, priority: 0.9 }),
        makeIntent({ plyIndex: 11, priority: 0.9 }),
        makeIntent({ plyIndex: 12, priority: 0.9 }),
      ];
      const filter = createDensityFilter('normal');

      const result = filter.filter(intents, 40);

      expect(result.includedIntents.map((i) => i.plyIndex)).toEqual([10, 11]);
      expect(result.filteredIntents.map((i) => i.plyIndex)).toEqual([12]);
      expect(result.filterReasons.get(12)).toBe('window density exceeded (2/2)');
      expect(result.stats.densityViolations).toBe(1);
    });
  });

  describe('minimum gap and consecutive comments', () => {
    it('filters consecutive comments when allowConsecutive is false', () => {
      const intents = [makeIntent({ plyIndex: 10 }), makeIntent({ plyIndex: 11 })];
      const filter = createDensityFilter('normal');

      const result = filter.filter(intents, 40);

      expect(result.includedIntents.map((i) => i.plyIndex)).toEqual([10]);
      expect(result.filterReasons.get(11)).toBe('consecutive comments not allowed');
    });

    it('enforces minPlyGap even when allowConsecutive is true', () => {
      const filter = new DensityFilter({
        maxCommentsPerWindow: 5,
        windowSize: 2,
        minPlyGap: 3,
        guaranteedPriorityThreshold: 0.9,
        allowConsecutive: true,
        maxCommentRatio: 1,
      });
      const intents = [makeIntent({ plyIndex: 10 }), makeIntent({ plyIndex: 12 })];

      const result = filter.filter(intents, 40);

      expect(result.includedIntents.map((i) => i.plyIndex)).toEqual([10]);
      expect(result.filterReasons.get(12)).toBe('minimum gap (3) not met');
    });

    it('allows adjacent plies at the verbose level', () => {
      const intents = [makeIntent({ plyIndex: 10 }), makeIntent({ plyIndex: 11 })];
      const filter = createDensityFilter('verbose');

      const result = filter.filter(intents, 40);

      expect(result.includedIntents.map((i) => i.plyIndex)).toEqual([10, 11]);
    });
  });

  describe('guaranteedPriorityThreshold', () => {
    it('lets an intent at exactly the threshold bypass a gap violation', () => {
      // normal threshold is 0.7; the check is priority < threshold, so 0.7 passes
      const intents = [
        makeIntent({ plyIndex: 10, priority: 0.7 }),
        makeIntent({ plyIndex: 11, priority: 0.7 }),
      ];
      const filter = createDensityFilter('normal');

      const result = filter.filter(intents, 40);

      expect(result.includedIntents.map((i) => i.plyIndex)).toEqual([10, 11]);
    });

    it('filters an intent just below the threshold on a gap violation', () => {
      const intents = [
        makeIntent({ plyIndex: 10, priority: 0.7 }),
        makeIntent({ plyIndex: 11, priority: 0.69 }),
      ];
      const filter = createDensityFilter('normal');

      const result = filter.filter(intents, 40);

      expect(result.includedIntents.map((i) => i.plyIndex)).toEqual([10]);
      expect(result.filterReasons.get(11)).toBe('consecutive comments not allowed');
    });

    it('does not bypass window violations regardless of priority', () => {
      // Documents current behavior: guaranteedPriorityThreshold only guards the
      // gap check; the window density check filters even priority-1.0 intents.
      const intents = [
        makeIntent({ plyIndex: 10, priority: 1 }),
        makeIntent({ plyIndex: 11, priority: 1 }),
        makeIntent({ plyIndex: 12, priority: 1 }),
      ];
      const filter = createDensityFilter('normal');

      const result = filter.filter(intents, 40);

      expect(result.filteredIntents.map((i) => i.plyIndex)).toEqual([12]);
      expect(result.filterReasons.get(12)).toBe('window density exceeded (2/2)');
    });
  });

  describe('output shape', () => {
    it('sorts included intents by plyIndex even when input is in priority order', () => {
      const intents = [
        makeIntent({ plyIndex: 30, priority: 0.9 }),
        makeIntent({ plyIndex: 10, priority: 0.8 }),
        makeIntent({ plyIndex: 20, priority: 0.7 }),
      ];
      const filter = createDensityFilter('normal');

      const result = filter.filter(intents, 40);

      expect(result.includedIntents.map((i) => i.plyIndex)).toEqual([10, 20, 30]);
    });

    it('keys filterReasons by the filtered intent plyIndex', () => {
      const intents = Array.from({ length: 6 }, (_, i) => makeIntent({ plyIndex: i * 10 }));
      const filter = createDensityFilter('sparse');

      const result = filter.filter(intents, 20); // cap 3 -> plies 30, 40, 50 filtered

      expect([...result.filterReasons.keys()].sort((a, b) => a - b)).toEqual([30, 40, 50]);
      expect(result.stats.totalIntents).toBe(6);
    });
  });
});

describe('compressAdjacentIntents', () => {
  it('merges runs of intents within maxGap into groups', () => {
    const intents = [1, 2, 3, 8, 10, 20].map((plyIndex) => makeIntent({ plyIndex }));

    const groups = compressAdjacentIntents(intents, 2);

    expect(groups.map((g) => g.map((i) => i.plyIndex))).toEqual([[1, 2, 3], [8, 10], [20]]);
  });

  it('sorts unsorted input by ply before grouping', () => {
    const intents = [10, 1, 8, 3, 2, 20].map((plyIndex) => makeIntent({ plyIndex }));

    const groups = compressAdjacentIntents(intents, 2);

    expect(groups.map((g) => g.map((i) => i.plyIndex))).toEqual([[1, 2, 3], [8, 10], [20]]);
  });

  it('returns an empty array for no intents', () => {
    expect(compressAdjacentIntents([], 2)).toEqual([]);
  });
});

describe('selectRepresentativeIntent', () => {
  it('picks the max-priority intent from a group', () => {
    const group = [
      makeIntent({ plyIndex: 1, priority: 0.3 }),
      makeIntent({ plyIndex: 2, priority: 0.9 }),
      makeIntent({ plyIndex: 3, priority: 0.5 }),
    ];

    expect(selectRepresentativeIntent(group).plyIndex).toBe(2);
  });

  it('prefers mandatory intents even at lower priority', () => {
    const group = [
      makeIntent({ plyIndex: 1, priority: 0.9 }),
      makeIntent({ plyIndex: 2, priority: 0.2, mandatory: true }),
    ];

    expect(selectRepresentativeIntent(group).plyIndex).toBe(2);
  });
});

describe('recommendDensityLevel', () => {
  it('recommends verbose below 40 plies, normal through 120, sparse above', () => {
    expect(recommendDensityLevel(39)).toBe('verbose');
    expect(recommendDensityLevel(40)).toBe('normal');
    expect(recommendDensityLevel(120)).toBe('normal');
    expect(recommendDensityLevel(121)).toBe('sparse');
  });
});

describe('calculateIdealPositions', () => {
  it('spaces positions evenly across the game', () => {
    expect(calculateIdealPositions(100, 4, DENSITY_CONFIGS.normal)).toEqual([20, 40, 60, 80]);
  });

  it('caps the desired count by the density ratio', () => {
    // normal ratio 0.25 on 20 plies -> at most 5 positions, spacing 20/6
    expect(calculateIdealPositions(20, 10, DENSITY_CONFIGS.normal)).toEqual([3, 7, 10, 13, 17]);
  });

  it('returns an empty array when the ratio cap is zero', () => {
    expect(calculateIdealPositions(3, 5, DENSITY_CONFIGS.sparse)).toEqual([]);
    expect(calculateIdealPositions(100, 0, DENSITY_CONFIGS.normal)).toEqual([]);
  });
});
