/**
 * Client hooks exports
 */

export { useWebSocket, type UseWebSocketOptions, type UseWebSocketResult } from './useWebSocket.js';
export { useKeyboard, type UseKeyboardOptions } from './useKeyboard.js';
export { useStdoutDimensions, type StdoutDimensions } from './useStdoutDimensions.js';
export {
  computeBackoffDelay,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  RECONNECT_JITTER_MS,
} from './backoff.js';
