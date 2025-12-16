/**
 * WebSocket Server for Debug GUI
 *
 * Broadcasts debug events to connected clients.
 * Runs alongside the CLI analysis process.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { DebugGuiEvent } from '../shared/events.js';
import { debugGuiEmitter } from './event-emitter.js';

export interface DebugGuiServerOptions {
  port: number;
  onConnection?: (clientCount: number) => void;
  onDisconnection?: (clientCount: number) => void;
  onError?: (error: Error) => void;
}

export class DebugGuiServer {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private eventHandler: ((event: DebugGuiEvent) => void) | null = null;

  constructor(private options: DebugGuiServerOptions) {}

  /**
   * Start the WebSocket server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.options.port });

        this.wss.on('listening', () => {
          // Enable the event emitter now that we're listening
          debugGuiEmitter.enable();
          resolve();
        });

        this.wss.on('connection', (ws) => {
          this.clients.add(ws);
          this.options.onConnection?.(this.clients.size);

          // Send welcome message with session info
          ws.send(
            JSON.stringify({
              type: 'connection:welcome',
              sessionId: debugGuiEmitter.getSessionId(),
              timestamp: Date.now(),
            }),
          );

          ws.on('close', () => {
            this.clients.delete(ws);
            this.options.onDisconnection?.(this.clients.size);
          });

          ws.on('error', (err) => {
            this.options.onError?.(err);
            this.clients.delete(ws);
          });
        });

        this.wss.on('error', (err) => {
          this.options.onError?.(err);
          reject(err);
        });

        // Listen to debug events and broadcast
        this.eventHandler = (event: DebugGuiEvent) => {
          this.broadcast(event);
        };
        debugGuiEmitter.on('debug-event', this.eventHandler);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Broadcast an event to all connected clients
   */
  broadcast(event: DebugGuiEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /**
   * Stop the WebSocket server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      // Remove event listener
      if (this.eventHandler) {
        debugGuiEmitter.off('debug-event', this.eventHandler);
        this.eventHandler = null;
      }

      // Disable event emitter
      debugGuiEmitter.disable();

      // Close all client connections
      for (const client of this.clients) {
        client.close(1000, 'Server shutting down');
      }
      this.clients.clear();

      // Close server
      if (this.wss) {
        this.wss.close(() => {
          this.wss = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the number of connected clients
   */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Check if server is running
   */
  get isRunning(): boolean {
    return this.wss !== null;
  }

  /**
   * Get the server port
   */
  get port(): number {
    return this.options.port;
  }
}

/**
 * Create and start a debug GUI server
 */
export async function createDebugGuiServer(
  port: number = 9222,
  callbacks?: Partial<DebugGuiServerOptions>,
): Promise<DebugGuiServer> {
  const server = new DebugGuiServer({
    port,
    ...callbacks,
  });
  await server.start();
  return server;
}

/**
 * Default port for debug GUI server
 */
export const DEFAULT_DEBUG_GUI_PORT = 9222;
