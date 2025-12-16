/**
 * WebSocket Connection Hook
 *
 * Manages WebSocket connection to the debug server with automatic reconnection.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useDebugStore } from '../state/store.js';
import { parseDebugEvent } from '../../shared/events.js';

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

export interface UseWebSocketOptions {
  url: string;
  autoConnect?: boolean;
}

export function useWebSocket({ url, autoConnect = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    processEvent,
    setConnectionStatus,
    setConnectionUrl,
    setSessionId,
    incrementReconnectAttempts,
    resetReconnectAttempts,
    connection,
  } = useDebugStore();

  const connect = useCallback(() => {
    // Don't connect if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    setConnectionUrl(url);
    setConnectionStatus('connecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        resetReconnectAttempts();
      };

      ws.onmessage = (event) => {
        const data = event.data;
        if (typeof data === 'string') {
          // Handle welcome message
          if (data.includes('"type":"connection:welcome"')) {
            const parsed = JSON.parse(data);
            if (parsed.sessionId) {
              setSessionId(parsed.sessionId);
            }
            return;
          }

          // Parse and process debug event
          const debugEvent = parseDebugEvent(data);
          if (debugEvent) {
            processEvent(debugEvent);
          }
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setConnectionStatus('disconnected');
        scheduleReconnect();
      };

      ws.onerror = () => {
        setConnectionStatus('error', 'Connection failed');
      };
    } catch (error) {
      setConnectionStatus('error', error instanceof Error ? error.message : 'Unknown error');
      scheduleReconnect();
    }
  }, [
    url,
    processEvent,
    setConnectionStatus,
    setConnectionUrl,
    setSessionId,
    resetReconnectAttempts,
  ]);

  const disconnect = useCallback(() => {
    // Cancel any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
  }, [setConnectionStatus]);

  const scheduleReconnect = useCallback(() => {
    const attempts = connection.reconnectAttempts;

    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionStatus('error', 'Max reconnection attempts reached');
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, attempts) + Math.random() * 1000,
      RECONNECT_MAX_DELAY,
    );

    incrementReconnectAttempts();

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connection.reconnectAttempts, connect, incrementReconnectAttempts, setConnectionStatus]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

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
