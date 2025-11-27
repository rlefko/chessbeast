/**
 * Custom assertions for game analysis validation
 */

import type { GameAnalysis, MoveClassification } from '@chessbeast/core';
import { expect } from 'vitest';

/**
 * Assert that analysis contains expected number of critical moments
 */
export function assertCriticalMomentCount(
  analysis: GameAnalysis,
  expected: { min?: number; max?: number; exact?: number },
): void {
  const count = analysis.criticalMoments.length;

  if (expected.exact !== undefined) {
    expect(count, `Expected exactly ${expected.exact} critical moments`).toBe(expected.exact);
    return;
  }

  if (expected.min !== undefined) {
    expect(count, `Expected at least ${expected.min} critical moments`).toBeGreaterThanOrEqual(
      expected.min,
    );
  }

  if (expected.max !== undefined) {
    expect(count, `Expected at most ${expected.max} critical moments`).toBeLessThanOrEqual(
      expected.max,
    );
  }
}

/**
 * Assert that specific ply indices are marked as critical moments
 */
export function assertCriticalMomentsAt(analysis: GameAnalysis, expectedPlies: number[]): void {
  const actualPlies = analysis.criticalMoments.map((cm) => cm.plyIndex);

  for (const ply of expectedPlies) {
    expect(actualPlies, `Expected critical moment at ply ${ply}`).toContain(ply);
  }
}

/**
 * Assert blunder count within expected range
 */
export function assertBlunderCount(
  analysis: GameAnalysis,
  expected: { white?: { min?: number; max?: number }; black?: { min?: number; max?: number } },
): void {
  if (expected.white) {
    const whiteBlunders = analysis.stats.white.blunders;
    if (expected.white.min !== undefined) {
      expect(whiteBlunders, 'White blunders below minimum').toBeGreaterThanOrEqual(
        expected.white.min,
      );
    }
    if (expected.white.max !== undefined) {
      expect(whiteBlunders, 'White blunders above maximum').toBeLessThanOrEqual(expected.white.max);
    }
  }

  if (expected.black) {
    const blackBlunders = analysis.stats.black.blunders;
    if (expected.black.min !== undefined) {
      expect(blackBlunders, 'Black blunders below minimum').toBeGreaterThanOrEqual(
        expected.black.min,
      );
    }
    if (expected.black.max !== undefined) {
      expect(blackBlunders, 'Black blunders above maximum').toBeLessThanOrEqual(expected.black.max);
    }
  }
}

/**
 * Assert move classifications at specific ply indices
 */
export function assertMoveClassifications(
  analysis: GameAnalysis,
  expected: Array<{ ply: number; classification: MoveClassification }>,
): void {
  for (const { ply, classification } of expected) {
    const move = analysis.moves[ply];
    expect(move, `No move found at ply ${ply}`).toBeDefined();
    expect(move?.classification, `Wrong classification at ply ${ply}`).toBe(classification);
  }
}

/**
 * Assert that accuracy is within expected range
 */
export function assertAccuracy(
  analysis: GameAnalysis,
  expected: { white?: { min?: number; max?: number }; black?: { min?: number; max?: number } },
): void {
  if (expected.white) {
    const whiteAccuracy = analysis.stats.white.accuracy;
    if (expected.white.min !== undefined) {
      expect(whiteAccuracy, 'White accuracy below minimum').toBeGreaterThanOrEqual(
        expected.white.min,
      );
    }
    if (expected.white.max !== undefined) {
      expect(whiteAccuracy, 'White accuracy above maximum').toBeLessThanOrEqual(expected.white.max);
    }
  }

  if (expected.black) {
    const blackAccuracy = analysis.stats.black.accuracy;
    if (expected.black.min !== undefined) {
      expect(blackAccuracy, 'Black accuracy below minimum').toBeGreaterThanOrEqual(
        expected.black.min,
      );
    }
    if (expected.black.max !== undefined) {
      expect(blackAccuracy, 'Black accuracy above maximum').toBeLessThanOrEqual(expected.black.max);
    }
  }
}

/**
 * Assert that opening is correctly identified
 */
export function assertOpening(
  analysis: GameAnalysis,
  expected: { eco?: string; name?: string },
): void {
  if (expected.eco) {
    expect(
      analysis.metadata.eco,
      `Expected ECO code ${expected.eco}, got ${analysis.metadata.eco}`,
    ).toBe(expected.eco);
  }

  if (expected.name) {
    expect(
      analysis.metadata.openingName,
      `Expected opening name to contain "${expected.name}"`,
    ).toContain(expected.name);
  }
}

/**
 * Assert that annotations exist on critical moments
 */
export function assertAnnotationsOnCriticalMoments(analysis: GameAnalysis): void {
  for (const criticalMoment of analysis.criticalMoments) {
    const move = analysis.moves[criticalMoment.plyIndex];
    expect(
      move?.comment,
      `No annotation on critical moment at ply ${criticalMoment.plyIndex}`,
    ).toBeDefined();
    expect(
      move?.comment?.length,
      `Empty annotation on critical moment at ply ${criticalMoment.plyIndex}`,
    ).toBeGreaterThan(0);
  }
}

/**
 * Assert that game summary exists and has content
 */
export function assertHasSummary(analysis: GameAnalysis, minLength: number = 50): void {
  expect(analysis.summary, 'No game summary').toBeDefined();
  expect(analysis.summary?.length, `Summary too short (min ${minLength})`).toBeGreaterThanOrEqual(
    minLength,
  );
}

/**
 * Assert total moves match expected
 */
export function assertTotalMoves(analysis: GameAnalysis, expected: number): void {
  expect(analysis.stats.totalMoves, `Expected ${expected} moves`).toBe(expected);
}

/**
 * Assert total plies (half-moves) match expected
 */
export function assertTotalPlies(analysis: GameAnalysis, expected: number): void {
  expect(analysis.stats.totalPlies, `Expected ${expected} plies`).toBe(expected);
}

/**
 * Comprehensive analysis validation
 */
export function assertValidAnalysis(analysis: GameAnalysis): void {
  // Metadata validation
  expect(analysis.metadata.white).toBeDefined();
  expect(analysis.metadata.black).toBeDefined();
  expect(analysis.metadata.result).toBeDefined();

  // Moves validation
  expect(analysis.moves.length).toBeGreaterThan(0);
  for (let i = 0; i < analysis.moves.length; i++) {
    const move = analysis.moves[i]!;
    expect(move.plyIndex, `Invalid plyIndex at position ${i}`).toBe(i);
    expect(move.san, `Missing SAN at ply ${i}`).toBeDefined();
    expect(move.classification, `Missing classification at ply ${i}`).toBeDefined();
  }

  // Stats validation
  expect(analysis.stats.totalPlies).toBe(analysis.moves.length);
  expect(analysis.stats.totalMoves).toBe(Math.ceil(analysis.moves.length / 2));
  expect(analysis.stats.white.accuracy).toBeGreaterThanOrEqual(0);
  expect(analysis.stats.white.accuracy).toBeLessThanOrEqual(100);
  expect(analysis.stats.black.accuracy).toBeGreaterThanOrEqual(0);
  expect(analysis.stats.black.accuracy).toBeLessThanOrEqual(100);

  // Critical moments validation
  for (const cm of analysis.criticalMoments) {
    expect(cm.plyIndex).toBeGreaterThanOrEqual(0);
    expect(cm.plyIndex).toBeLessThan(analysis.moves.length);
    expect(cm.type).toBeDefined();
    expect(cm.score).toBeGreaterThanOrEqual(0);
    expect(cm.score).toBeLessThanOrEqual(100);
  }
}
