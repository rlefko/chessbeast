import { describe, it, expect } from 'vitest';

import {
  RATING_THRESHOLDS,
  getThresholdsForRating,
  getInterpolatedThresholds,
  CRITICAL_MOMENT_THRESHOLDS,
} from '../classifier/thresholds.js';

describe('Rating Thresholds', () => {
  describe('RATING_THRESHOLDS', () => {
    it('should cover full rating range from 0 to 4000', () => {
      expect(RATING_THRESHOLDS[0]!.minRating).toBe(0);
      expect(RATING_THRESHOLDS[RATING_THRESHOLDS.length - 1]!.maxRating).toBe(4000);
    });

    it('should have contiguous rating bands with no gaps', () => {
      for (let i = 1; i < RATING_THRESHOLDS.length; i++) {
        expect(RATING_THRESHOLDS[i]!.minRating).toBe(RATING_THRESHOLDS[i - 1]!.maxRating);
      }
    });

    it('should have stricter thresholds at higher ratings', () => {
      // Blunder threshold should decrease as rating increases
      for (let i = 1; i < RATING_THRESHOLDS.length; i++) {
        expect(RATING_THRESHOLDS[i]!.blunderThreshold).toBeLessThanOrEqual(
          RATING_THRESHOLDS[i - 1]!.blunderThreshold,
        );
      }
    });
  });

  describe('getThresholdsForRating', () => {
    it('should return beginner thresholds for rating 500', () => {
      const thresholds = getThresholdsForRating(500);
      expect(thresholds.blunderThreshold).toBe(500);
    });

    it('should return intermediate thresholds for rating 1300', () => {
      const thresholds = getThresholdsForRating(1300);
      expect(thresholds.blunderThreshold).toBe(300);
    });

    it('should return expert thresholds for rating 1900', () => {
      const thresholds = getThresholdsForRating(1900);
      expect(thresholds.blunderThreshold).toBe(180);
    });

    it('should return GM thresholds for rating 2500', () => {
      const thresholds = getThresholdsForRating(2500);
      expect(thresholds.blunderThreshold).toBe(100);
    });

    it('should clamp very high ratings to max band', () => {
      const thresholds = getThresholdsForRating(5000);
      expect(thresholds.blunderThreshold).toBe(100);
    });

    it('should clamp negative ratings to min band', () => {
      const thresholds = getThresholdsForRating(-100);
      expect(thresholds.blunderThreshold).toBe(500);
    });
  });

  describe('getInterpolatedThresholds', () => {
    it('should return same thresholds at band boundaries', () => {
      const exact = getThresholdsForRating(1200);
      const interpolated = getInterpolatedThresholds(1200);
      expect(interpolated.blunderThreshold).toBe(exact.blunderThreshold);
    });

    it('should interpolate thresholds between bands', () => {
      const lower = getThresholdsForRating(1400);
      const upper = getThresholdsForRating(1600);
      const mid = getInterpolatedThresholds(1500);

      // Mid should be between lower and upper
      expect(mid.blunderThreshold).toBeLessThan(lower.blunderThreshold);
      expect(mid.blunderThreshold).toBeGreaterThan(upper.blunderThreshold);
    });

    it('should work at the highest rating band', () => {
      const thresholds = getInterpolatedThresholds(3000);
      expect(thresholds.blunderThreshold).toBe(100);
    });
  });
});

describe('Critical Moment Thresholds', () => {
  it('should have reasonable eval swing thresholds', () => {
    expect(CRITICAL_MOMENT_THRESHOLDS.minEvalSwing).toBeGreaterThan(0);
    expect(CRITICAL_MOMENT_THRESHOLDS.largeEvalSwing).toBeGreaterThan(
      CRITICAL_MOMENT_THRESHOLDS.minEvalSwing,
    );
    expect(CRITICAL_MOMENT_THRESHOLDS.veryLargeEvalSwing).toBeGreaterThan(
      CRITICAL_MOMENT_THRESHOLDS.largeEvalSwing,
    );
  });

  it('should cap critical moments at 25%', () => {
    expect(CRITICAL_MOMENT_THRESHOLDS.maxCriticalRatio).toBe(0.25);
  });
});
