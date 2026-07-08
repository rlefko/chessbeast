/**
 * WebSocket Connection Hook
 *
 * Manages WebSocket connection to the debug server with automatic reconnection.
 *
 * Reconnect attempts are tracked in a ref inside a single stable connect
 * function (no stale closures), backoff grows exponentially, and a clean
 * server close (code 1000) ends the session without reconnecting.
 */

import { useEffect, useRef, useCallback } from 'react';

import { parseDebugEvent } from '../../shared/events.js';
import { useDebugStore, type ConnectionState } from '../state/store.js';

import { computeBackoffDelay, MAX_RECONNECT_ATTEMPTS } from './backoff.js';

export interface UseWebSocketOptions {
  url: string;
  autoConnect?: boolean;
}

export interface UseWebSocketResult {
  connect: () => void;
  disconnect: () => void;
  isConnected: boolean;
  isConnecting: boolean;
  status: ConnectionState['status'];
  error: string | undefined;
  reconnectAttempts: number;
}

export function useWebSocket({ url, autoConnect = true }: UseWebSocketOptions): UseWebSocketResult {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const closedByClientRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  // Subscribe only to the connection slice for the returned status values
  const connection = useDebugStore((state) => state.connection);

  const clearReconnectTimer = useCallback((): void => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback((): void => {
    const store = useDebugStore.getState();
    const attempt = attemptsRef.current;

    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      store.setConnectionStatus('error', 'Max reconnection attempts reached');
      return;
    }

    const delay = computeBackoffDelay(attempt);
    attemptsRef.current = attempt + 1;
    store.incrementReconnectAttempts();

    clearReconnectTimer();
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connectRef.current();
    }, delay);
  }, [clearReconnectTimer]);

  const connect = useCallback((): void => {
    // Don't connect if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const store = useDebugStore.getState();
    closedByClientRef.current = false;
    store.setConnectionUrl(url);
    store.setConnectionStatus('connecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = (): void => {
        clearReconnectTimer();
        attemptsRef.current = 0;
        const s = useDebugStore.getState();
        s.setConnectionStatus('connected');
        s.resetReconnectAttempts();
      };

      ws.onmessage = (event): void => {
        const data = event.data;
        if (typeof data === 'string') {
          const s = useDebugStore.getState();

          // Handle welcome message
          if (data.includes('"type":"connection:welcome"')) {
            try {
              const parsed = JSON.parse(data) as { sessionId?: string };
              if (parsed.sessionId) {
                s.setSessionId(parsed.sessionId);
              }
            } catch {
              // Malformed welcome payloads are ignored
            }
            return;
          }

          // Parse and process debug event
          const debugEvent = parseDebugEvent(data);
          if (debugEvent) {
            s.processEvent(debugEvent);
          }
        }
      };

      ws.onclose = (event): void => {
        wsRef.current = null;
        if (closedByClientRef.current) return;

        const s = useDebugStore.getState();
        if (event.code === 1000) {
          // Clean server shutdown: the analysis session ended, don't reconnect
          s.setConnectionStatus('ended', 'Session ended');
          return;
        }
        s.setConnectionStatus('disconnected');
        scheduleReconnect();
      };

      ws.onerror = (): void => {
        useDebugStore.getState().setConnectionStatus('error', 'Connection failed');
      };
    } catch (error) {
      useDebugStore
        .getState()
        .setConnectionStatus('error', error instanceof Error ? error.message : 'Unknown error');
      scheduleReconnect();
    }
  }, [url, scheduleReconnect, clearReconnectTimer]);

  // Keep the ref pointing at the latest connect (used by reconnect timers)
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback((): void => {
    closedByClientRef.current = true;
    clearReconnectTimer();

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
    useDebugStore.getState().setConnectionStatus('disconnected');
  }, [clearReconnectTimer]);

  // Auto-connect on mount / when the URL changes
  useEffect(() => {
    if (autoConnect) {
      attemptsRef.current = 0;
      connectRef.current();
    }

    return (): void => {
      disconnect();
    };
    // The connect function is reached through connectRef so this effect only
    // re-runs when the target URL (or autoConnect) changes.
  }, [url, autoConnect, disconnect]);

  return {
    connect,
    disconnect,
    isConnected: connection.status === 'connected',
    isConnecting: connection.status === 'connecting',
    status: connection.status,
    error: connection.error,
    reconnectAttempts: connection.reconnectAttempts,
  };
}
