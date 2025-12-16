/**
 * Server-side exports for Debug GUI
 *
 * These are used by the CLI to emit events and run the WebSocket server.
 */

export { debugGuiEmitter, DebugGuiEventEmitter } from './event-emitter.js';
export {
  DebugGuiServer,
  createDebugGuiServer,
  DEFAULT_DEBUG_GUI_PORT,
  type DebugGuiServerOptions,
} from './websocket-server.js';
