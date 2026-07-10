/**
 * Reconnection backoff policy for the Debug GUI WebSocket client.
 *
 * Pure and exported separately so it can be unit tested without React.
 */

/** Base delay for the first reconnect attempt */
export const RECONNECT_BASE_DELAY_MS = 1000;

/** Upper bound on any reconnect delay */
export const RECONNECT_MAX_DELAY_MS = 30000;

/** Maximum random jitter added to a delay */
export const RECONNECT_JITTER_MS = 1000;

/** Give up reconnecting after this many attempts */
export const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Compute the exponential-backoff delay (with jitter) for a reconnect attempt.
 *
 * @param attempt - Zero-based attempt counter (0 = first reconnect)
 * @param random - Random source in [0, 1); injectable for tests
 * @returns Delay in milliseconds, capped at RECONNECT_MAX_DELAY_MS
 */
export function computeBackoffDelay(attempt: number, random: () => number = Math.random): number {
  const exponential = RECONNECT_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt));
  const jitter = random() * RECONNECT_JITTER_MS;
  return Math.min(exponential + jitter, RECONNECT_MAX_DELAY_MS);
}
