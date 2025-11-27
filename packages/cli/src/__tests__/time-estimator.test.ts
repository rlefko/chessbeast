/**
 * TimeEstimator unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { TimeEstimator } from '../progress/time-estimator.js';

describe('TimeEstimator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create with default window size', () => {
      const estimator = new TimeEstimator();
      expect(estimator.getSampleCount()).toBe(0);
    });

    it('should create with custom window size', () => {
      const estimator = new TimeEstimator(5);
      expect(estimator.getSampleCount()).toBe(0);
    });
  });

  describe('record', () => {
    it('should record progress samples', () => {
      const estimator = new TimeEstimator();

      estimator.record(0);
      expect(estimator.getSampleCount()).toBe(1);

      estimator.record(10);
      expect(estimator.getSampleCount()).toBe(2);
    });

    it('should limit samples to window size', () => {
      const estimator = new TimeEstimator(3);

      estimator.record(0);
      estimator.record(10);
      estimator.record(20);
      expect(estimator.getSampleCount()).toBe(3);

      estimator.record(30);
      expect(estimator.getSampleCount()).toBe(3);
    });
  });

  describe('estimateRemaining', () => {
    it('should return null with insufficient samples', () => {
      const estimator = new TimeEstimator();

      estimator.record(0);
      expect(estimator.estimateRemaining(0, 100)).toBeNull();
    });

    it('should estimate remaining time based on progress rate', () => {
      const estimator = new TimeEstimator();

      vi.setSystemTime(0);
      estimator.record(0);

      vi.setSystemTime(1000); // 1 second later
      estimator.record(10); // 10 progress per second

      // At 10 progress/second, 90 remaining = 9 seconds
      const remaining = estimator.estimateRemaining(10, 100);
      expect(remaining).toBe(9000);
    });

    it('should return 0 when already complete', () => {
      const estimator = new TimeEstimator();

      vi.setSystemTime(0);
      estimator.record(0);

      vi.setSystemTime(1000);
      estimator.record(100);

      const remaining = estimator.estimateRemaining(100, 100);
      expect(remaining).toBe(0);
    });

    it('should return null if no progress made', () => {
      const estimator = new TimeEstimator();

      vi.setSystemTime(0);
      estimator.record(50);

      vi.setSystemTime(1000);
      estimator.record(50); // Same progress

      expect(estimator.estimateRemaining(50, 100)).toBeNull();
    });

    it('should use rolling average for smoother estimates', () => {
      const estimator = new TimeEstimator(5);

      // Fast progress initially
      vi.setSystemTime(0);
      estimator.record(0);

      vi.setSystemTime(100);
      estimator.record(10); // Fast: 10 per 100ms

      vi.setSystemTime(200);
      estimator.record(20);

      // Slower progress later
      vi.setSystemTime(700);
      estimator.record(25); // Slower: 5 per 500ms

      vi.setSystemTime(1200);
      estimator.record(30);

      // Estimate should be based on average rate
      const remaining = estimator.estimateRemaining(30, 100);
      expect(remaining).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should clear all samples', () => {
      const estimator = new TimeEstimator();

      estimator.record(0);
      estimator.record(10);
      expect(estimator.getSampleCount()).toBe(2);

      estimator.reset();
      expect(estimator.getSampleCount()).toBe(0);
    });

    it('should return null after reset', () => {
      const estimator = new TimeEstimator();

      vi.setSystemTime(0);
      estimator.record(0);

      vi.setSystemTime(1000);
      estimator.record(50);

      estimator.reset();
      expect(estimator.estimateRemaining(50, 100)).toBeNull();
    });
  });
});
