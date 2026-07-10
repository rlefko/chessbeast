/**
 * Tests for line memory tracking
 */

import { describe, it, expect } from 'vitest';

import type { LineMemory, LineMemoryConfig } from '../memory/line-memory.js';
import {
  addEvalToMemory,
  addSummaryEntry,
  cloneLineMemory,
  createLineMemory,
  deserializeLineMemory,
  detectEvalSwing,
  getEvalTrendDirection,
  getSummaryBullets,
  isConceptExplained,
  isIdeaExplored,
  markConceptExplained,
  markIdeaExplored,
  serializeLineMemory,
  updateLinePosition,
} from '../memory/line-memory.js';
import type { IdeaKey } from '../themes/idea-keys.js';
import type { ThemeInstance } from '../themes/types.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function makeKey(concept: string): IdeaKey {
  return {
    key: `plan:${concept}:kingside:w`,
    type: 'plan',
    concept,
    instance: 'kingside',
    beneficiary: 'w',
  };
}

function makeTheme(): ThemeInstance {
  return {
    themeKey: 'outpost:d5:w',
    type: 'outpost',
    category: 'positional',
    beneficiary: 'w',
    primarySquare: 'd5',
    severity: 'moderate',
    confidence: 0.8,
    confidenceLevel: 'high',
    explanation: 'Knight outpost on d5',
    firstSeenPly: 12,
    lastSeenPly: 14,
    status: 'persisting',
    noveltyScore: 0.7,
  };
}

function makeMemory(): LineMemory {
  return createLineMemory('line-1', START_FEN, 'node-0');
}

function pushEvals(memory: LineMemory, cps: number[]): void {
  cps.forEach((cp, i) => {
    addEvalToMemory(memory, { ply: i + 1, cp });
  });
}

describe('concept and idea tracking', () => {
  it('marks and checks explained concepts', () => {
    const memory = makeMemory();
    const attack = makeKey('kingside_attack');

    expect(isConceptExplained(memory, attack)).toBe(false);
    markConceptExplained(memory, attack);
    expect(isConceptExplained(memory, attack)).toBe(true);
    expect(isConceptExplained(memory, makeKey('minority_attack'))).toBe(false);
  });

  it('marks and checks explored ideas', () => {
    const memory = makeMemory();
    const idea = makeKey('rook_lift');

    expect(isIdeaExplored(memory, idea)).toBe(false);
    markIdeaExplored(memory, idea);
    expect(isIdeaExplored(memory, idea)).toBe(true);
  });

  it('keeps concept and explored sets independent', () => {
    const memory = makeMemory();
    const idea = makeKey('pawn_storm');

    markConceptExplained(memory, idea);
    expect(isIdeaExplored(memory, idea)).toBe(false);

    markIdeaExplored(memory, makeKey('exchange_sac'));
    expect(isConceptExplained(memory, makeKey('exchange_sac'))).toBe(false);
  });
});

describe('getEvalTrendDirection', () => {
  it('returns stable with fewer than 3 entries', () => {
    const memory = makeMemory();
    pushEvals(memory, [0, 200]);

    expect(getEvalTrendDirection(memory)).toBe('stable');
  });

  it('returns improving when the last-5 window rises by more than 50cp', () => {
    const memory = makeMemory();
    pushEvals(memory, [0, 20, 60]);

    expect(getEvalTrendDirection(memory)).toBe('improving');
  });

  it('returns declining when the last-5 window falls by more than 50cp', () => {
    const memory = makeMemory();
    pushEvals(memory, [0, -10, -60]);

    expect(getEvalTrendDirection(memory)).toBe('declining');
  });

  it('returns stable at a diff of exactly +/-50cp', () => {
    const improving = makeMemory();
    pushEvals(improving, [0, 25, 50]);
    expect(getEvalTrendDirection(improving)).toBe('stable');

    const declining = makeMemory();
    pushEvals(declining, [0, -25, -50]);
    expect(getEvalTrendDirection(declining)).toBe('stable');
  });

  it('only considers the last 5 entries', () => {
    const memory = makeMemory();
    // Big overall drop, but the last 5 entries only move 40cp
    pushEvals(memory, [500, 0, 10, 20, 30, 40]);

    expect(getEvalTrendDirection(memory)).toBe('stable');
  });
});

describe('detectEvalSwing', () => {
  it('detects a swing at exactly the default 80cp threshold', () => {
    const memory = makeMemory();
    pushEvals(memory, [0, 80]);

    expect(detectEvalSwing(memory)).toEqual({ hasSwing: true, amount: 80 });
  });

  it('does not detect a swing just below the threshold', () => {
    const memory = makeMemory();
    pushEvals(memory, [0, 79]);

    expect(detectEvalSwing(memory)).toEqual({ hasSwing: false, amount: 79 });
  });

  it('respects a custom threshold', () => {
    const memory = makeMemory();
    pushEvals(memory, [0, 80]);

    expect(detectEvalSwing(memory, 100)).toEqual({ hasSwing: false, amount: 80 });
  });

  it('reports no swing with fewer than 2 entries', () => {
    const memory = makeMemory();
    expect(detectEvalSwing(memory)).toEqual({ hasSwing: false, amount: 0 });

    pushEvals(memory, [120]);
    expect(detectEvalSwing(memory)).toEqual({ hasSwing: false, amount: 0 });
  });
});

describe('addSummaryEntry', () => {
  const smallConfig: LineMemoryConfig = {
    maxSummaryEntries: 3,
    minSummaryEntries: 1,
    evalSwingThreshold: 80,
    maxEvalHistory: 100,
  };

  function addAt(memory: LineMemory, ply: number, text: string, priority: number): void {
    updateLinePosition(memory, `node-${ply}`, START_FEN, ply);
    addSummaryEntry(memory, { text, type: 'other', priority }, smallConfig);
  }

  it('stamps entries with the current ply', () => {
    const memory = makeMemory();
    updateLinePosition(memory, 'node-7', START_FEN, 7);

    addSummaryEntry(memory, { text: 'eval jumped', type: 'eval_swing', priority: 3 });

    expect(memory.rollingSummary).toHaveLength(1);
    expect(memory.rollingSummary[0]?.ply).toBe(7);
  });

  it('caps entries at maxSummaryEntries, evicting the lowest priority', () => {
    const memory = makeMemory();
    addAt(memory, 1, 'high', 5);
    addAt(memory, 2, 'lowest', 1);
    addAt(memory, 3, 'medium-high', 4);
    addAt(memory, 4, 'medium', 3);

    // Survivors are re-sorted chronologically
    expect(getSummaryBullets(memory)).toEqual(['high', 'medium-high', 'medium']);
    expect(memory.rollingSummary.map((e) => e.ply)).toEqual([1, 3, 4]);
  });

  it('breaks priority ties by keeping the most recent entries', () => {
    const memory = makeMemory();
    addAt(memory, 1, 'first', 2);
    addAt(memory, 2, 'second', 2);
    addAt(memory, 3, 'third', 2);
    addAt(memory, 4, 'fourth', 2);

    expect(getSummaryBullets(memory)).toEqual(['second', 'third', 'fourth']);
  });
});

describe('cloneLineMemory', () => {
  function populated(): LineMemory {
    const memory = makeMemory();
    updateLinePosition(memory, 'node-9', START_FEN, 9);
    addSummaryEntry(memory, { text: 'outpost established', type: 'theme_emerged', priority: 4 });
    memory.activeThemes = [makeTheme()];
    markConceptExplained(memory, makeKey('kingside_attack'));
    markIdeaExplored(memory, makeKey('rook_lift'));
    pushEvals(memory, [0, 30, 90]);
    memory.narrativeFocus = 'kingside attack';
    return memory;
  }

  it('copies state and records the branch point', () => {
    const memory = populated();

    const clone = cloneLineMemory(memory, 'line-2', 9);

    expect(clone.lineId).toBe('line-2');
    expect(clone.parentLineId).toBe('line-1');
    expect(clone.branchPly).toBe(9);
    expect(clone.currentPly).toBe(9);
    expect(clone.currentFen).toBe(memory.currentFen);
    expect(clone.currentNodeId).toBe('node-9');
    expect(getSummaryBullets(clone)).toEqual(['outpost established']);
    expect(clone.activeThemes).toEqual(memory.activeThemes);
    expect(isConceptExplained(clone, makeKey('kingside_attack'))).toBe(true);
    expect(isIdeaExplored(clone, makeKey('rook_lift'))).toBe(true);
    expect(clone.evalTrend).toEqual(memory.evalTrend);
    expect(clone.narrativeFocus).toBe('kingside attack');
  });

  it('is independent of the original after cloning', () => {
    const memory = populated();
    const clone = cloneLineMemory(memory, 'line-2', 9);

    // Mutate the original
    markConceptExplained(memory, makeKey('minority_attack'));
    addSummaryEntry(memory, { text: 'new event', type: 'other', priority: 1 });
    addEvalToMemory(memory, { ply: 10, cp: 150 });

    expect(isConceptExplained(clone, makeKey('minority_attack'))).toBe(false);
    expect(getSummaryBullets(clone)).toEqual(['outpost established']);
    expect(clone.evalTrend).toHaveLength(3);

    // Mutate the clone
    markIdeaExplored(clone, makeKey('exchange_sac'));
    expect(isIdeaExplored(memory, makeKey('exchange_sac'))).toBe(false);
  });
});

describe('serialize/deserialize', () => {
  it('roundtrips a fully populated memory', () => {
    const memory = createLineMemory('line-3', START_FEN, 'node-0', {
      parentLineId: 'line-1',
      branchPly: 6,
      initialPly: 6,
    });
    updateLinePosition(memory, 'node-12', START_FEN, 12);
    addSummaryEntry(memory, { text: 'eval swing', type: 'eval_swing', priority: 5 });
    memory.activeThemes = [makeTheme()];
    markConceptExplained(memory, makeKey('kingside_attack'));
    markIdeaExplored(memory, makeKey('rook_lift'));
    memory.explainedThemeKeys.add(makeKey('outpost'));
    pushEvals(memory, [10, -20, 60]);
    memory.narrativeFocus = 'conversion';

    const restored = deserializeLineMemory(serializeLineMemory(memory));

    expect(restored.lineId).toBe('line-3');
    expect(restored.currentNodeId).toBe('node-12');
    expect(restored.currentFen).toBe(START_FEN);
    expect(restored.currentPly).toBe(12);
    expect(restored.parentLineId).toBe('line-1');
    expect(restored.branchPly).toBe(6);
    expect(restored.rollingSummary).toEqual(memory.rollingSummary);
    expect(restored.activeThemes).toEqual(memory.activeThemes);
    expect(restored.explainedThemeKeys.export()).toEqual(memory.explainedThemeKeys.export());
    expect(restored.explainedConceptKeys.export()).toEqual(memory.explainedConceptKeys.export());
    expect(restored.exploredIdeaKeys.export()).toEqual(memory.exploredIdeaKeys.export());
    expect(restored.evalTrend).toEqual(memory.evalTrend);
    expect(restored.narrativeFocus).toBe('conversion');
  });

  it('omits optional fields that were never set', () => {
    const memory = makeMemory();

    const restored = deserializeLineMemory(serializeLineMemory(memory));

    expect(restored.parentLineId).toBeUndefined();
    expect(restored.branchPly).toBeUndefined();
    expect(restored.narrativeFocus).toBeUndefined();
    expect(restored.rollingSummary).toEqual([]);
    expect(restored.evalTrend).toEqual([]);
  });
});
