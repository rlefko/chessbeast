/**
 * Zustand State Store for Debug GUI
 *
 * Thin wiring layer: incoming WebSocket events are dispatched to the pure
 * per-domain reducers in reducers.ts; this module owns connection/UI state,
 * LLM chunk batching, and the pause buffer.
 */

import { create } from 'zustand';

import type { DebugGuiEvent } from '../../shared/events.js';

import {
  reduceChess,
  reduceLlm,
  reduceEngine,
  reduceAnnotations,
  reduceSession,
  appendLlmText,
  initialChessState,
  initialLLMState,
  initialEngineDomainState,
  initialSessionDomainState,
  type ChessState,
  type LLMState,
  type EngineState,
  type ExplorationState,
  type DetectedTheme,
  type CriticalMoment,
  type AnnotationItem,
  type PhaseState,
  type SessionState,
} from './reducers.js';

export type {
  ChessState,
  LLMState,
  LLMTokenTotals,
  LLMSessionTotals,
  EngineState,
  ExplorationState,
  DetectedTheme,
  CriticalMoment,
  AnnotationItem,
  AnnotationStatus,
  PhaseState,
  SessionState,
  PVLine,
} from './reducers.js';

// =============================================================================
// Connection / UI State
// =============================================================================

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'ended' | 'error';
  url: string;
  sessionId?: string | undefined;
  lastMessageAt: number | null;
  reconnectAttempts: number;
  error?: string | undefined;
}

export type PanelId = 'board' | 'llm' | 'annotations' | 'engine';

export interface UIState {
  focusedPanel: PanelId;
  showHelp: boolean;
  paused: boolean;
}

const initialConnectionState: ConnectionState = {
  status: 'disconnected',
  url: '',
  lastMessageAt: null,
  reconnectAttempts: 0,
};

const initialUIState: UIState = {
  focusedPanel: 'board',
  showHelp: false,
  paused: false,
};

// =============================================================================
// Store Interface
// =============================================================================

export interface DebugState {
  // Data state (owned by reducers)
  chess: ChessState;
  llm: LLMState;
  engine: EngineState;
  exploration: ExplorationState | null;
  themes: DetectedTheme[];
  criticalMoments: CriticalMoment[];
  annotations: AnnotationItem[];
  phase: PhaseState | null;
  session: SessionState;

  // Store-owned state
  connection: ConnectionState;
  ui: UIState;

  // Event processing
  processEvent: (event: DebugGuiEvent) => void;

  // Connection actions
  setConnectionStatus: (status: ConnectionState['status'], error?: string) => void;
  setConnectionUrl: (url: string) => void;
  setSessionId: (sessionId: string) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;

  // UI actions
  focusPanel: (panel: PanelId) => void;
  focusNextPanel: () => void;
  focusPrevPanel: () => void;
  toggleHelp: () => void;
  togglePause: () => void;
  flipBoard: () => void;
  scrollLLM: (delta: number) => void;
  followLLM: () => void;
  highlightPVLine: (line: number | null) => void;
  reset: () => void;
}

// =============================================================================
// Module-local buffers
// =============================================================================

const PANEL_ORDER: PanelId[] = ['board', 'llm', 'annotations', 'engine'];

/** Flush interval for batched llm:stream_chunk appends */
export const LLM_CHUNK_FLUSH_MS = 50;

/** Maximum events buffered while paused (bounded ring) */
export const MAX_PAUSED_EVENTS = 500;

/** Minimum interval between reactive lastMessageAt updates */
const LAST_MESSAGE_AT_THROTTLE_MS = 1000;

/** Upper bound used by "scroll to oldest" (render clamps to content length) */
export const LLM_SCROLL_MAX = 1_000_000;

interface ChunkBuffer {
  thinking: string;
  content: string;
  lastChunkType: 'thinking' | 'content' | null;
  timer: ReturnType<typeof setTimeout> | null;
}

const chunkBuffer: ChunkBuffer = { thinking: '', content: '', lastChunkType: null, timer: null };
let pausedEvents: DebugGuiEvent[] = [];
let lastMessageAtStamp = 0;

function clearChunkBuffer(): void {
  chunkBuffer.thinking = '';
  chunkBuffer.content = '';
  chunkBuffer.lastChunkType = null;
  if (chunkBuffer.timer) {
    clearTimeout(chunkBuffer.timer);
    chunkBuffer.timer = null;
  }
}

// =============================================================================
// Store
// =============================================================================

export const useDebugStore = create<DebugState>((set, get) => {
  /** Flush any buffered llm:stream_chunk text into the store in one update */
  const flushChunkBuffer = (): void => {
    if (chunkBuffer.timer) {
      clearTimeout(chunkBuffer.timer);
      chunkBuffer.timer = null;
    }
    if (chunkBuffer.thinking.length === 0 && chunkBuffer.content.length === 0) return;
    const { thinking, content, lastChunkType } = chunkBuffer;
    chunkBuffer.thinking = '';
    chunkBuffer.content = '';
    chunkBuffer.lastChunkType = null;
    set((state) => ({ llm: appendLlmText(state.llm, thinking, content, lastChunkType) }));
  };

  /** Apply a single event through the domain reducers */
  const applyEvent = (event: DebugGuiEvent): void => {
    if (event.type === 'llm:stream_chunk') {
      // Batch chunk appends: buffer module-locally, flush on a short timer
      if (event.chunkType === 'thinking') {
        chunkBuffer.thinking += event.text;
      } else {
        chunkBuffer.content += event.text;
      }
      chunkBuffer.lastChunkType = event.chunkType;
      if (!chunkBuffer.timer) {
        chunkBuffer.timer = setTimeout(flushChunkBuffer, LLM_CHUNK_FLUSH_MS);
      }
      return;
    }

    // Preserve ordering: any non-chunk event flushes pending chunk text first
    flushChunkBuffer();

    set((state) => ({
      chess: reduceChess(state.chess, event),
      llm: reduceLlm(state.llm, event),
      ...reduceEngine(
        {
          engine: state.engine,
          exploration: state.exploration,
          themes: state.themes,
          criticalMoments: state.criticalMoments,
        },
        event,
      ),
      annotations: reduceAnnotations(state.annotations, event),
      ...reduceSession({ session: state.session, phase: state.phase }, event),
    }));
  };

  return {
    // Initial state
    chess: initialChessState,
    llm: initialLLMState,
    ...initialEngineDomainState,
    annotations: [],
    ...initialSessionDomainState,
    connection: initialConnectionState,
    ui: initialUIState,

    // Process incoming WebSocket events
    processEvent: (event: DebugGuiEvent): void => {
      if (get().ui.paused) {
        // Buffer while paused (bounded ring); replayed on resume
        pausedEvents.push(event);
        if (pausedEvents.length > MAX_PAUSED_EVENTS) {
          pausedEvents.shift();
        }
        return;
      }

      // Throttled activity timestamp (avoids per-event re-renders elsewhere)
      const now = Date.now();
      if (now - lastMessageAtStamp >= LAST_MESSAGE_AT_THROTTLE_MS) {
        lastMessageAtStamp = now;
        set((state) => ({ connection: { ...state.connection, lastMessageAt: now } }));
      }

      applyEvent(event);
    },

    // Connection actions
    setConnectionStatus: (status, error): void =>
      set((state) => ({
        connection: { ...state.connection, status, error },
      })),

    setConnectionUrl: (url): void =>
      set((state) => ({
        connection: { ...state.connection, url },
      })),

    setSessionId: (sessionId): void =>
      set((state) => ({
        connection: { ...state.connection, sessionId },
      })),

    incrementReconnectAttempts: (): void =>
      set((state) => ({
        connection: {
          ...state.connection,
          reconnectAttempts: state.connection.reconnectAttempts + 1,
        },
      })),

    resetReconnectAttempts: (): void =>
      set((state) => ({
        connection: { ...state.connection, reconnectAttempts: 0 },
      })),

    // UI actions
    focusPanel: (panel): void =>
      set((state) => ({
        ui: { ...state.ui, focusedPanel: panel },
      })),

    focusNextPanel: (): void =>
      set((state) => {
        const currentIndex = PANEL_ORDER.indexOf(state.ui.focusedPanel);
        const nextIndex = (currentIndex + 1) % PANEL_ORDER.length;
        return { ui: { ...state.ui, focusedPanel: PANEL_ORDER[nextIndex]! } };
      }),

    focusPrevPanel: (): void =>
      set((state) => {
        const currentIndex = PANEL_ORDER.indexOf(state.ui.focusedPanel);
        const prevIndex = (currentIndex - 1 + PANEL_ORDER.length) % PANEL_ORDER.length;
        return { ui: { ...state.ui, focusedPanel: PANEL_ORDER[prevIndex]! } };
      }),

    toggleHelp: (): void =>
      set((state) => ({
        ui: { ...state.ui, showHelp: !state.ui.showHelp },
      })),

    togglePause: (): void => {
      const wasPaused = get().ui.paused;
      set((state) => ({
        ui: { ...state.ui, paused: !state.ui.paused },
      }));
      if (wasPaused) {
        // Resume: replay buffered events in arrival order
        const toReplay = pausedEvents;
        pausedEvents = [];
        for (const event of toReplay) {
          applyEvent(event);
        }
      }
    },

    flipBoard: (): void =>
      set((state) => ({
        chess: {
          ...state.chess,
          perspective: state.chess.perspective === 'white' ? 'black' : 'white',
        },
      })),

    scrollLLM: (delta): void =>
      set((state) => ({
        llm: {
          ...state.llm,
          scrollOffset: Math.max(0, Math.min(LLM_SCROLL_MAX, state.llm.scrollOffset + delta)),
        },
      })),

    followLLM: (): void =>
      set((state) => ({
        llm: { ...state.llm, scrollOffset: 0 },
      })),

    highlightPVLine: (line): void =>
      set((state) => ({
        engine: { ...state.engine, highlightedLine: line },
      })),

    reset: (): void => {
      clearChunkBuffer();
      pausedEvents = [];
      lastMessageAtStamp = 0;
      set({
        chess: initialChessState,
        llm: initialLLMState,
        ...initialEngineDomainState,
        annotations: [],
        ...initialSessionDomainState,
        ui: initialUIState,
      });
    },
  };
});
