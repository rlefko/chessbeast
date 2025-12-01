/**
 * Tests for win probability calculation
 */

import { describe, it, expect } from 'vitest';

import {
  cpToWinProbability,
  calculateWinProbDrop,
  classifyByWinProbDrop,
  getMoveAccuracy,
  WIN_PROB_THRESHOLDS,
} from '../win-probability.js';

describe('cpToWinProbability', () => {
  it('should return 50% for equal position (0cp)', () => {
    expect(cpToWinProbability(0)).toBeCloseTo(50, 1);
  });

  it('should return ~59% for small advantage (+100cp)', () => {
    const prob = cpToWinProbability(100);
    expect(prob).toBeGreaterThan(58);
    expect(prob).toBeLessThan(61);
  });

  it('should return ~41% for small disadvantage (-100cp)', () => {
    const prob = cpToWinProbability(-100);
    expect(prob).toBeGreaterThan(39);
    expect(prob).toBeLessThan(42);
  });

  it('should return ~86% for clear advantage (+500cp)', () => {
    const prob = cpToWinProbability(500);
    expect(prob).toBeGreaterThan(85);
    expect(prob).toBeLessThan(88);
  });

  it('should return 100% for mate in favor', () => {
    expect(cpToWinProbability(10000)).toBe(100);
    expect(cpToWinProbability(15000)).toBe(100);
  });

  it('should return 0% for mate against', () => {
    expect(cpToWinProbability(-10000)).toBe(0);
    expect(cpToWinProbability(-15000)).toBe(0);
  });

  it('should be symmetric around 50%', () => {
    const plusProb = cpToWinProbability(200);
    const minusProb = cpToWinProbability(-200);
    expect(plusProb + minusProb).toBeCloseTo(100, 0);
  });
});

describe('calculateWinProbDrop', () => {
  it('should return 0 for maintaining same position', () => {
    // Player has +100, after move opponent has -100 (same from player view)
    const drop = calculateWinProbDrop(100, -100);
    expect(drop).toBeCloseTo(0, 1);
  });

  it('should return positive for losing win chance', () => {
    // Player has +100, after move opponent has +50 (worse for player)
    const drop = calculateWinProbDrop(100, 50);
    expect(drop).toBeGreaterThan(0);
  });

  it('should return negative for gaining win chance', () => {
    // Player has -100, after move opponent has -200 (better for player)
    const drop = calculateWinProbDrop(-100, -200);
    expect(drop).toBeLessThan(0);
  });

  it('should detect blunder (>20% drop)', () => {
    // Player has +100 (~55%), after move opponent has +300 (~34% for player)
    const drop = calculateWinProbDrop(100, 300);
    expect(drop).toBeGreaterThan(WIN_PROB_THRESHOLDS.blunder);
  });
});

describe('classifyByWinProbDrop', () => {
  it('should return $4 (blunder) for >20% drop', () => {
    expect(classifyByWinProbDrop(25)).toBe('$4');
  });

  it('should return $2 (mistake) for >10% drop', () => {
    expect(classifyByWinProbDrop(15)).toBe('$2');
  });

  it('should return $6 (dubious) for >5% drop', () => {
    expect(classifyByWinProbDrop(7)).toBe('$6');
  });

  it('should return $1 (good) for >5% gain', () => {
    expect(classifyByWinProbDrop(-7)).toBe('$1');
  });

  it('should return undefined for normal moves', () => {
    expect(classifyByWinProbDrop(2)).toBeUndefined();
    expect(classifyByWinProbDrop(-2)).toBeUndefined();
  });
});

describe('getMoveAccuracy', () => {
  it('should return ~100% for perfect move (no win prob drop)', () => {
    // Same position maintained
    const accuracy = getMoveAccuracy(100, -100);
    expect(accuracy).toBeGreaterThan(95);
  });

  it('should return lower accuracy for mistakes', () => {
    // Big win prob drop
    const accuracy = getMoveAccuracy(100, 300);
    expect(accuracy).toBeLessThan(80);
  });

  it('should be clamped to 0-100', () => {
    const acc1 = getMoveAccuracy(0, 0);
    expect(acc1).toBeGreaterThanOrEqual(0);
    expect(acc1).toBeLessThanOrEqual(100);

    const acc2 = getMoveAccuracy(500, -500);
    expect(acc2).toBeGreaterThanOrEqual(0);
    expect(acc2).toBeLessThanOrEqual(100);
  });
});
