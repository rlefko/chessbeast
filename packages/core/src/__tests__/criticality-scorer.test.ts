import { describe, it, expect } from 'vitest';

import {
  calculateCriticality,
  createCriticalityScore,
  scoreToCriticalityLevel,
  shouldPromoteTier,
  quickCriticalityCheck,
  DEFAULT_WEIGHTS,
  TIER_PROMOTION_THRESHOLDS,
  CRITICALITY_LEVEL_THRESHOLDS,
  type CriticalityFactors,
} from '../classifier/criticality-scorer.js';

/**
 * Build a full factors object with all contributions zeroed unless overridden
 */
function makeFactors(overrides: Partial<CriticalityFactors> = {}): CriticalityFactors {
  return {
    winProbDelta: 0,
    cpDelta: 0,
    tacticalVolatility: 0,
    themeNovelty: 0,
    kingSafetyRisk: 0,
    repetitionPenalty: 0,
    ...overrides,
  };
}

describe('criticality-scorer', () => {
  describe('monotonicity properties', () => {
    it('score is non-decreasing as |winProbDelta| grows', () => {
      let previous = -1;
      for (let winProbDelta = 0; winProbDelta <= 100; winProbDelta += 5) {
        const { score } = createCriticalityScore(makeFactors({ winProbDelta }));
        expect(score).toBeGreaterThanOrEqual(previous);
        previous = score;
      }
      // And the factor actually moves the score somewhere in the range
      expect(previous).toBeGreaterThan(0);
    });

    it('score is non-decreasing as cpDelta grows', () => {
      let previous = -1;
      for (let cpDelta = 0; cpDelta <= 600; cpDelta += 50) {
        const { score } = createCriticalityScore(makeFactors({ cpDelta }));
        expect(score).toBeGreaterThanOrEqual(previous);
        previous = score;
      }
      expect(previous).toBeGreaterThan(0);
    });

    it('score is non-decreasing as the tactical theme count grows', () => {
      let previous = -1;
      for (let tacticalThemes = 0; tacticalThemes <= 8; tacticalThemes++) {
        const { score } = calculateCriticality(0, 0, { tacticalThemes });
        expect(score).toBeGreaterThanOrEqual(previous);
        previous = score;
      }
      expect(previous).toBeGreaterThan(0);
    });
  });

  describe('score bounds', () => {
    it('stays within [0, 100] for extreme inputs', () => {
      const evals = [-100000, -10000, -300, 0, 300, 10000, 100000];
      for (const before of evals) {
        for (const after of evals) {
          const { score } = calculateCriticality(before, after, {
            tacticalThemes: 50,
            newThemes: 50,
            kingSafetyDelta: -100000,
            alreadyExplained: true,
          });
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      }
    });

    it('clamps to 0 when the repetition penalty exceeds positive contributions', () => {
      const result = calculateCriticality(0, 0, { alreadyExplained: true });
      // Raw weighted score would be -10 (only the penalty term); clamped to 0
      expect(result.score).toBe(0);
    });

    it('reaches exactly 100 when every positive factor saturates', () => {
      const result = createCriticalityScore(
        makeFactors({
          winProbDelta: 100,
          cpDelta: 600,
          tacticalVolatility: 1,
          themeNovelty: 1,
          kingSafetyRisk: 1,
        }),
      );
      expect(result.score).toBeCloseTo(100, 10);
      expect(result.recommendedTier).toBe('full');
    });
  });

  describe('repetition penalty', () => {
    it('alreadyExplained strictly lowers the score by the penalty weight', () => {
      const fresh = calculateCriticality(300, 300);
      const repeated = calculateCriticality(300, 300, { alreadyExplained: true });

      expect(repeated.score).toBeLessThan(fresh.score);
      // Both eval factors saturate at 1: fresh = (0.3 + 0.25) * 100 = 55
      expect(fresh.score).toBeCloseTo(55, 5);
      expect(repeated.score).toBeCloseTo(45, 5);
      expect(repeated.factors.repetitionPenalty).toBe(1);
      expect(fresh.factors.repetitionPenalty).toBe(0);
    });
  });

  describe('weight overrides', () => {
    it('respects a full custom weight configuration', () => {
      const weights = {
        winProbDelta: 0,
        cpDelta: 0,
        tacticalVolatility: 1,
        themeNovelty: 0,
        kingSafetyRisk: 0,
        repetitionPenalty: 0,
      };
      // Two tactical themes map to a volatility factor of 0.7
      const overridden = calculateCriticality(0, 0, { tacticalThemes: 2, weights });
      const defaulted = calculateCriticality(0, 0, { tacticalThemes: 2 });

      expect(overridden.score).toBeCloseTo(70, 5);
      expect(defaulted.score).toBeCloseTo(0.7 * DEFAULT_WEIGHTS.tacticalVolatility * 100, 5);
    });

    it('merges partial weight overrides with the defaults', () => {
      const withoutCp = calculateCriticality(300, 300, { weights: { cpDelta: 0 } });
      const withDefaults = calculateCriticality(300, 300);

      // Only the cp contribution (0.25 * 100) is removed; winProb weight stays at default
      expect(withDefaults.score).toBeCloseTo(55, 5);
      expect(withoutCp.score).toBeCloseTo(30, 5);
    });
  });

  describe('factor semantics', () => {
    it('computes cpDelta as |evalBefore + evalAfter| (evalAfter is from the opponent view)', () => {
      // Mover keeps a +100 edge: after the move the opponent sees -100, so no swing
      const maintained = calculateCriticality(100, -100);
      expect(maintained.factors.cpDelta).toBe(0);

      // Mover had +100, opponent now sees +100: a 200cp swing against the mover
      const swung = calculateCriticality(100, 100);
      expect(swung.factors.cpDelta).toBe(200);
    });

    it('generates human-readable reasons for the dominant factors', () => {
      expect(calculateCriticality(0, 0).reason).toBe('quiet position');
      expect(calculateCriticality(0, 0, { alreadyExplained: true }).reason).toBe(
        '(already explained)',
      );

      const bigSwing = calculateCriticality(300, 300);
      expect(bigSwing.reason).toContain('win probability change');
      expect(bigSwing.reason).toContain('cp eval swing');

      // Score above the medium level but no single factor above its reason threshold
      const moderate = createCriticalityScore(
        makeFactors({ winProbDelta: 10, cpDelta: 100, tacticalVolatility: 0.4, themeNovelty: 0.5 }),
      );
      expect(moderate.reason).toBe('moderate interest');
    });
  });

  describe('threshold constants', () => {
    it('pins the exact tier promotion and level threshold values', () => {
      expect(TIER_PROMOTION_THRESHOLDS).toEqual({ standard: 40, full: 70 });
      expect(CRITICALITY_LEVEL_THRESHOLDS).toEqual({ medium: 25, high: 50, critical: 75 });
      expect(DEFAULT_WEIGHTS).toEqual({
        winProbDelta: 0.3,
        cpDelta: 0.25,
        tacticalVolatility: 0.2,
        themeNovelty: 0.15,
        kingSafetyRisk: 0.1,
        repetitionPenalty: 0.1,
      });
    });
  });

  describe('scoreToCriticalityLevel', () => {
    it('classifies scores using inclusive lower bounds at 25/50/75', () => {
      expect(scoreToCriticalityLevel(0)).toBe('low');
      expect(scoreToCriticalityLevel(24.999)).toBe('low');
      expect(scoreToCriticalityLevel(25)).toBe('medium');
      expect(scoreToCriticalityLevel(49.999)).toBe('medium');
      expect(scoreToCriticalityLevel(50)).toBe('high');
      expect(scoreToCriticalityLevel(74.999)).toBe('high');
      expect(scoreToCriticalityLevel(75)).toBe('critical');
      expect(scoreToCriticalityLevel(100)).toBe('critical');
    });
  });

  describe('shouldPromoteTier', () => {
    it('promotes exactly at the standard (40) and full (70) thresholds', () => {
      expect(shouldPromoteTier('shallow', 39.999)).toBe('shallow');
      expect(shouldPromoteTier('shallow', 40)).toBe('standard');
      expect(shouldPromoteTier('shallow', 69.999)).toBe('standard');
      expect(shouldPromoteTier('shallow', 70)).toBe('full');
      expect(shouldPromoteTier('standard', 69.999)).toBe('standard');
      expect(shouldPromoteTier('standard', 70)).toBe('full');
    });

    it('never demotes below the current tier', () => {
      expect(shouldPromoteTier('full', 0)).toBe('full');
      expect(shouldPromoteTier('full', 39.999)).toBe('full');
      expect(shouldPromoteTier('standard', 0)).toBe('standard');
      expect(shouldPromoteTier('standard', 39.999)).toBe('standard');
    });
  });

  describe('quickCriticalityCheck', () => {
    it('returns false just below the dubious win-probability threshold', () => {
      // A 50cp swing against the mover is only a ~4.6% win probability drop
      expect(quickCriticalityCheck(0, 50)).toBe(false);
      expect(quickCriticalityCheck(0, 0)).toBe(false);
    });

    it('returns true at or above the threshold in either direction', () => {
      // A 60cp swing against the mover is a ~5.5% win probability drop
      expect(quickCriticalityCheck(0, 60)).toBe(true);
      // Gains count too: the check uses the absolute win probability change
      expect(quickCriticalityCheck(0, -60)).toBe(true);
    });
  });
});
