/**
 * Tests for the Debug GUI WebSocket server using a real socket on port 0.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';

import { debugGuiEmitter } from '../server/event-emitter.js';
import { DebugGuiServer } from '../server/websocket-server.js';

let server: DebugGuiServer | null = null;

afterEach(async () => {
  if (server) {
    await server.stop();
    server = null;
  }
});

async function startServer(): Promise<DebugGuiServer> {
  server = new DebugGuiServer({ port: 0 });
  await server.start();
  return server;
}

interface TestClient {
  ws: WebSocket;
  /** Await the next message (messages are queued from connection time) */
  nextMessage: () => Promise<Record<string, unknown>>;
  close: () => void;
}

/**
 * Connect a client whose message listener is attached before the socket
 * opens, so early frames (like the welcome event) are never missed.
 */
function connectClient(port: number): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const queue: Array<Record<string, unknown>> = [];
    const waiters: Array<(msg: Record<string, unknown>) => void> = [];

    ws.on('message', (data) => {
      const message = JSON.parse(String(data)) as Record<string, unknown>;
      const waiter = waiters.shift();
      if (waiter) {
        waiter(message);
      } else {
        queue.push(message);
      }
    });

    const nextMessage = (): Promise<Record<string, unknown>> => {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolveMsg, rejectMsg) => {
        const timeout = setTimeout(
          () => rejectMsg(new Error('timed out waiting for message')),
          2000,
        );
        waiters.push((msg) => {
          clearTimeout(timeout);
          resolveMsg(msg);
        });
      });
    };

    ws.on('open', () => resolve({ ws, nextMessage, close: (): void => ws.close() }));
    ws.on('error', reject);
  });
}

describe('DebugGuiServer', () => {
  it('starts on an ephemeral port and enables the emitter', async () => {
    const srv = await startServer();
    expect(srv.isRunning).toBe(true);
    expect(srv.port).toBeGreaterThan(0);
    expect(debugGuiEmitter.isEnabled()).toBe(true);

    await srv.stop();
    server = null;
    expect(debugGuiEmitter.isEnabled()).toBe(false);
  });

  it('sends a welcome event carrying the emitter session ID on connect', async () => {
    const srv = await startServer();
    const client = await connectClient(srv.port);
    try {
      const welcome = await client.nextMessage();
      expect(welcome.type).toBe('connection:welcome');
      expect(welcome.sessionId).toBe(debugGuiEmitter.getSessionId());
    } finally {
      client.close();
    }
  });

  it('broadcasts emitted debug events to connected clients', async () => {
    const srv = await startServer();
    const client = await connectClient(srv.port);
    try {
      const welcome = await client.nextMessage();
      expect(welcome.type).toBe('connection:welcome');

      debugGuiEmitter.phaseStart('deep_analysis', 'Engine Exploration', 12);

      const event = await client.nextMessage();
      expect(event.type).toBe('phase:start');
      expect(event.phaseName).toBe('Engine Exploration');
      expect(event.sessionId).toBe(debugGuiEmitter.getSessionId());
    } finally {
      client.close();
    }
  });

  it('closes clients with code 1000 on stop()', async () => {
    const srv = await startServer();
    const client = await connectClient(srv.port);
    await client.nextMessage(); // welcome

    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      client.ws.on('close', (code, reason) => resolve({ code, reason: String(reason) }));
    });

    await srv.stop();
    server = null;

    const { code, reason } = await closed;
    expect(code).toBe(1000);
    expect(reason).toContain('shutting down');
  });
});
