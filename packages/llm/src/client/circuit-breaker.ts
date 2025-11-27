/**
 * Circuit breaker pattern implementation for resilient API calls
 */

import type { CircuitBreakerConfig } from '../config/llm-config.js';
import { CircuitOpenError } from '../errors.js';

import type { CircuitState } from './types.js';

/**
 * Circuit breaker for protecting against cascade failures
 *
 * States:
 * - closed: Normal operation, requests pass through
 * - open: Circuit tripped, requests fail immediately
 * - half-open: Testing if service recovered, limited requests pass through
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private openedAt: Date | undefined;

  constructor(private readonly config: CircuitBreakerConfig) {}

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.checkReset();
    return this.state;
  }

  /**
   * Get number of consecutive failures
   */
  getFailureCount(): number {
    return this.failures;
  }

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.checkReset();

    if (this.state === 'open') {
      throw new CircuitOpenError(
        this.openedAt ?? new Date(),
        this.getRemainingResetTime(),
      );
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this.failures = 0;

    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.close();
      }
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(): void {
    this.failures++;
    this.successes = 0;

    if (this.state === 'half-open') {
      this.open();
    } else if (this.state === 'closed' && this.failures >= this.config.failureThreshold) {
      this.open();
    }
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.close();
  }

  private open(): void {
    this.state = 'open';
    this.openedAt = new Date();
    this.successes = 0;
  }

  private close(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.openedAt = undefined;
  }

  private halfOpen(): void {
    this.state = 'half-open';
    this.successes = 0;
  }

  private checkReset(): void {
    if (this.state === 'open' && this.shouldReset()) {
      this.halfOpen();
    }
  }

  private shouldReset(): boolean {
    if (!this.openedAt) return false;
    const elapsed = Date.now() - this.openedAt.getTime();
    return elapsed >= this.config.resetTimeoutMs;
  }

  private getRemainingResetTime(): number {
    if (!this.openedAt) return 0;
    const elapsed = Date.now() - this.openedAt.getTime();
    return Math.max(0, this.config.resetTimeoutMs - elapsed);
  }
}
