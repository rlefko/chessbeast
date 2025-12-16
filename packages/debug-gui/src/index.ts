/**
 * @chessbeast/debug-gui
 *
 * Terminal-based Debug GUI for Ultra-Fast Coach annotation pipeline.
 *
 * Server-side exports (for CLI integration):
 * - debugGuiEmitter: Singleton event emitter
 * - DebugGuiServer: WebSocket server class
 * - createDebugGuiServer: Helper to start server
 *
 * Shared exports:
 * - Event types for WebSocket communication
 */

// Server-side exports (used by CLI)
export {
  debugGuiEmitter,
  DebugGuiEventEmitter,
  DebugGuiServer,
  createDebugGuiServer,
  DEFAULT_DEBUG_GUI_PORT,
  type DebugGuiServerOptions,
} from './server/index.js';

// Shared event types
export * from './shared/events.js';
