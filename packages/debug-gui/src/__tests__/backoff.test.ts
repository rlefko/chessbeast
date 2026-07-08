/**
 * Tests for the pure reconnect backoff policy.
 */

import { describe, it, expect } from 'vitest';

import {
  computeBackoffDelay,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_JITTER_MS,
  RECONNECT_MAX_DELAY_MS,
} from '../client/hooks/backoff.js';

describe('computeBackoffDelay', () => {
  it('grows exponentially with the attempt number', () => {
    const noJitter = (): number => 0;
    expect(computeBackoffDelay(0, noJitter)).toBe(RECONNECT_BASE_DELAY_MS);
    expect(computeBackoffDelay(1, noJitter)).toBe(RECONNECT_BASE_DELAY_MS * 2);
    expect(computeBackoffDelay(2, noJitter)).toBe(RECONNECT_BASE_DELAY_MS * 4);
    expect(computeBackoffDelay(3, noJitter)).toBe(RECONNECT_BASE_DELAY_MS * 8);
  });

  it('adds bounded jitter on top of the exponential delay', () => {
    for (let i = 0; i < 50; i++) {
      const delay = computeBackoffDelay(1);
      expect(delay).toBeGreaterThanOrEqual(RECONNECT_BASE_DELAY_MS * 2);
      expect(delay).toBeLessThan(RECONNECT_BASE_DELAY_MS * 2 + RECONNECT_JITTER_MS);
    }
  });

  it('caps the delay at the maximum', () => {
    expect(computeBackoffDelay(10, () => 0)).toBe(RECONNECT_MAX_DELAY_MS);
    expect(computeBackoffDelay(30, () => 0.999)).toBe(RECONNECT_MAX_DELAY_MS);
  });

  it('treats negative attempts as the first attempt', () => {
    expect(computeBackoffDelay(-3, () => 0)).toBe(RECONNECT_BASE_DELAY_MS);
  });
});
