/**
 * Tests for circuit breaker
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreaker } from '../client/circuit-breaker.js';
import { CircuitOpenError } from '../errors.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeoutMs: 1000,
    });
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed');
    });

    it('should have zero failures', () => {
      expect(breaker.getFailureCount()).toBe(0);
    });
  });

  describe('closed state', () => {
    it('should allow operations to pass through', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should record failures', async () => {
      try {
        await breaker.execute(async () => {
          throw new Error('test error');
        });
      } catch {
        // Expected
      }

      expect(breaker.getFailureCount()).toBe(1);
    });

    it('should open after threshold failures', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('test error');
          });
        } catch {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('open');
    });

    it('should reset failure count on success', async () => {
      // Record some failures
      try {
        await breaker.execute(async () => {
          throw new Error('test error');
        });
      } catch {
        // Expected
      }

      expect(breaker.getFailureCount()).toBe(1);

      // Success should reset
      await breaker.execute(async () => 'success');

      expect(breaker.getFailureCount()).toBe(0);
    });
  });

  describe('open state', () => {
    beforeEach(async () => {
      // Trip the circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('test error');
          });
        } catch {
          // Expected
        }
      }
    });

    it('should reject operations immediately', async () => {
      await expect(breaker.execute(async () => 'success')).rejects.toThrow(
        CircuitOpenError,
      );
    });

    it('should transition to half-open after timeout', async () => {
      vi.useFakeTimers();

      expect(breaker.getState()).toBe('open');

      // Advance time past reset timeout
      vi.advanceTimersByTime(1100);

      expect(breaker.getState()).toBe('half-open');

      vi.useRealTimers();
    });
  });

  describe('half-open state', () => {
    beforeEach(async () => {
      vi.useFakeTimers();

      // Trip the circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('test error');
          });
        } catch {
          // Expected
        }
      }

      // Advance to half-open
      vi.advanceTimersByTime(1100);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should allow test operations', async () => {
      expect(breaker.getState()).toBe('half-open');

      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should close after enough successes', async () => {
      expect(breaker.getState()).toBe('half-open');

      // Two successes should close the circuit
      await breaker.execute(async () => 'success');
      await breaker.execute(async () => 'success');

      expect(breaker.getState()).toBe('closed');
    });

    it('should open again on failure', async () => {
      expect(breaker.getState()).toBe('half-open');

      try {
        await breaker.execute(async () => {
          throw new Error('test error');
        });
      } catch {
        // Expected
      }

      expect(breaker.getState()).toBe('open');
    });
  });

  describe('reset', () => {
    it('should reset to closed state', async () => {
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('test error');
          });
        } catch {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('open');

      breaker.reset();

      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(0);
    });
  });
});
