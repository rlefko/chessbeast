/**
 * Zustand State Store for Debug GUI
 *
 * Manages all client-side state and processes incoming WebSocket events.
 */

import { create } from 'zustand';

import type { DebugGuiEvent } from '../../shared/events.js';

// =============================================================================
// State Interfaces
// =============================================================================

export interface ChessState {
  fen: string;
  moveNotation: string;
  moveNumber: number;
  isWhiteMove: boolean;
  evaluation?: { cp?: number | undefined; mate?: number | undefined } | undefined;
  bestMove?: string | undefined;
  classification?: string | undefined;
  cpLoss?: number | undefined;
  perspective: 'white' | 'black';
}

export interface MoveHistoryItem {
  notation: string;
  moveNumber: number;
  isWhite: boolean;
  evaluation?: number | undefined;
  classification?: string | undefined;
}

export interface LLMState {
  currentMove: string;
  isStreaming: boolean;
  isThinking: boolean;
  reasoning: string;
  content: string;
  model?: string | undefined;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
  };
  cost: number;
  scrollPosition: number;
}

export interface ToolCall {
  id: string;
  timestamp: number;
  toolName: string;
  toolArgs: Record<string, unknown>;
  iteration: number;
  maxIterations: number;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: unknown | undefined;
  error?: string | undefined;
  durationMs?: number | undefined;
  expanded: boolean;
}

export interface PVLine {
  rank: number;
  move: string;
  evaluation: { cp?: number | undefined; mate?: number | undefined };
  pv: string[];
}

export interface DetectedTheme {
  name: string;
  lifecycle: 'emerged' | 'persisting' | 'escalated' | 'resolved';
  fen: string;
  description?: string | undefined;
  timestamp: number;
}

export interface EngineState {
  fen: string;
  depth: number;
  nodes: number;
  nps: number;
  evaluation: { cp?: number | undefined; mate?: number | undefined };
  pv: string[];
  multipv: PVLine[];
  highlightedLine: number | null;
}

export interface ExplorationState {
  nodesExplored: number;
  maxNodes: number;
  currentDepth: number;
  phase: string;
  themesDetected: number;
  intentsGenerated: number;
}

export interface PhaseState {
  current: string;
  name: string;
  progress: number;
  total: number;
  detail?: string | undefined;
  startTime: number;
}

export interface SessionState {
  active: boolean;
  gameMetadata?:
    | {
        white: string;
        black: string;
        totalMoves: number;
        event?: string | undefined;
        date?: string | undefined;
        result?: string | undefined;
      }
    | undefined;
  stats?:
    | {
        gamesAnalyzed: number;
        criticalMoments: number;
        annotationsGenerated: number;
        totalTimeMs: number;
        totalCost?: number | undefined;
      }
    | undefined;
}

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  url: string;
  sessionId?: string | undefined;
  lastMessageAt: number | null;
  reconnectAttempts: number;
  error?: string | undefined;
}

export type PanelId = 'board' | 'llm' | 'tools' | 'engine';

export interface UIState {
  focusedPanel: PanelId;
  showHelp: boolean;
  paused: boolean;
}

export interface DebugState {
  // Data state
  chess: ChessState;
  moveHistory: MoveHistoryItem[];
  llm: LLMState;
  toolCalls: ToolCall[];
  engine: EngineState;
  exploration: ExplorationState | null;
  themes: DetectedTheme[];
  criticalMoments: Array<{ plyIndex: number; type: string; score: number; reason: string }>;
  phase: PhaseState | null;
  session: SessionState;
  connection: ConnectionState;
  ui: UIState;

  // Actions
  processEvent: (event: DebugGuiEvent) => void;
  setConnectionStatus: (status: ConnectionState['status'], error?: string) => void;
  setConnectionUrl: (url: string) => void;
  setSessionId: (sessionId: string) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
  focusPanel: (panel: PanelId) => void;
  focusNextPanel: () => void;
  focusPrevPanel: () => void;
  toggleHelp: () => void;
  togglePause: () => void;
  flipBoard: () => void;
  toggleToolExpand: (id: string) => void;
  scrollLLM: (delta: number) => void;
  highlightPVLine: (line: number | null) => void;
  reset: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const initialChessState: ChessState = {
  fen: STARTING_FEN,
  moveNotation: 'Starting position',
  moveNumber: 0,
  isWhiteMove: true,
  perspective: 'white',
};

const initialLLMState: LLMState = {
  currentMove: '',
  isStreaming: false,
  isThinking: false,
  reasoning: '',
  content: '',
  tokens: { input: 0, output: 0, reasoning: 0 },
  cost: 0,
  scrollPosition: 0,
};

const initialEngineState: EngineState = {
  fen: STARTING_FEN,
  depth: 0,
  nodes: 0,
  nps: 0,
  evaluation: { cp: 0 },
  pv: [],
  multipv: [],
  highlightedLine: null,
};

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
// Store
// =============================================================================

const PANEL_ORDER: PanelId[] = ['board', 'llm', 'tools', 'engine'];
const MAX_TOOL_CALLS = 100;
const MAX_THEMES = 50;

export const useDebugStore = create<DebugState>((set, get) => ({
  // Initial state
  chess: initialChessState,
  moveHistory: [],
  llm: initialLLMState,
  toolCalls: [],
  engine: initialEngineState,
  exploration: null,
  themes: [],
  criticalMoments: [],
  phase: null,
  session: { active: false },
  connection: initialConnectionState,
  ui: initialUIState,

  // Process incoming WebSocket events
  processEvent: (event: DebugGuiEvent): void => {
    const state = get();
    if (state.ui.paused) return;

    set({ connection: { ...state.connection, lastMessageAt: Date.now() } });

    switch (event.type) {
      // Position events
      case 'position:update':
        set({
          chess: {
            ...state.chess,
            fen: event.fen,
            moveNotation: event.moveNotation,
            moveNumber: event.moveNumber,
            isWhiteMove: event.isWhiteMove,
            evaluation: event.evaluation,
            bestMove: event.bestMove,
            classification: event.classification,
            cpLoss: event.cpLoss,
          },
        });
        break;

      case 'position:move_history':
        set({ moveHistory: event.moves });
        break;

      // LLM events
      case 'llm:stream_start':
        set({
          llm: {
            ...state.llm,
            currentMove: event.moveNotation,
            isStreaming: true,
            isThinking: false,
            reasoning: '',
            content: '',
            model: event.model,
          },
        });
        break;

      case 'llm:stream_chunk':
        if (event.chunkType === 'thinking') {
          set({
            llm: {
              ...state.llm,
              isThinking: true,
              reasoning: state.llm.reasoning + event.text,
            },
          });
        } else if (event.chunkType === 'content') {
          set({
            llm: {
              ...state.llm,
              isThinking: false,
              content: state.llm.content + event.text,
            },
          });
        }
        break;

      case 'llm:stream_end': {
        // Map event tokens to state tokens
        const newTokens = event.tokensUsed
          ? {
              input: event.tokensUsed.prompt,
              output: event.tokensUsed.completion,
              reasoning: event.tokensUsed.reasoning ?? 0,
            }
          : state.llm.tokens;
        set({
          llm: {
            ...state.llm,
            isStreaming: false,
            isThinking: false,
            content: event.finalComment ?? state.llm.content,
            tokens: newTokens,
            cost: state.llm.cost + (event.cost ?? 0),
          },
        });
        break;
      }

      // Tool events
      case 'tool:call_start': {
        const newCall: ToolCall = {
          id: `${event.toolName}-${event.timestamp}`,
          timestamp: event.timestamp,
          toolName: event.toolName,
          toolArgs: event.toolArgs,
          iteration: event.iteration,
          maxIterations: event.maxIterations,
          status: 'running',
          expanded: false,
        };
        const calls = [...state.toolCalls, newCall].slice(-MAX_TOOL_CALLS);
        set({ toolCalls: calls });
        break;
      }

      case 'tool:call_result': {
        const calls = state.toolCalls.map((call) => {
          if (call.toolName === event.toolName && call.status === 'running') {
            return {
              ...call,
              status: event.success ? ('success' as const) : ('error' as const),
              result: event.result,
              error: event.error,
              durationMs: event.durationMs,
            };
          }
          return call;
        });
        set({ toolCalls: calls });
        break;
      }

      // Engine events
      case 'engine:analysis':
        set({
          engine: {
            ...state.engine,
            fen: event.fen,
            depth: event.depth,
            nodes: event.nodes,
            nps: event.nps ?? 0,
            evaluation: event.evaluation,
            pv: event.pv,
            multipv: event.multipv ?? [],
          },
        });
        break;

      case 'engine:critical_moment':
        set({
          criticalMoments: [
            ...state.criticalMoments,
            {
              plyIndex: event.plyIndex,
              type: event.momentType,
              score: event.score,
              reason: event.reason,
            },
          ],
        });
        break;

      case 'engine:exploration_progress':
        set({
          exploration: {
            nodesExplored: event.nodesExplored,
            maxNodes: event.maxNodes,
            currentDepth: event.currentDepth,
            phase: event.phase,
            themesDetected: event.themesDetected ?? 0,
            intentsGenerated: event.intentsGenerated ?? 0,
          },
        });
        break;

      case 'engine:theme_detected': {
        const newTheme: DetectedTheme = {
          name: event.themeName,
          lifecycle: event.lifecycle,
          fen: event.fen,
          description: event.description,
          timestamp: event.timestamp,
        };
        const themes = [...state.themes, newTheme].slice(-MAX_THEMES);
        set({ themes });
        break;
      }

      // Phase events
      case 'phase:start':
        set({
          phase: {
            current: event.phase,
            name: event.phaseName,
            progress: 0,
            total: event.totalMoves ?? 0,
            startTime: event.timestamp,
          },
        });
        break;

      case 'phase:progress':
        if (state.phase) {
          set({
            phase: {
              ...state.phase,
              progress: event.current,
              total: event.total,
              detail: event.detail,
            },
          });
        }
        break;

      case 'phase:complete':
        if (state.phase) {
          set({
            phase: {
              ...state.phase,
              progress: state.phase.total,
              detail: event.detail,
            },
          });
        }
        break;

      // Session events
      case 'session:start':
        set({
          session: {
            active: true,
            gameMetadata: event.gameMetadata,
          },
          // Reset state for new session
          chess: initialChessState,
          moveHistory: [],
          llm: initialLLMState,
          toolCalls: [],
          engine: initialEngineState,
          exploration: null,
          themes: [],
          criticalMoments: [],
          phase: null,
        });
        break;

      case 'session:end':
        set({
          session: {
            ...state.session,
            active: false,
            stats: event.stats,
          },
        });
        break;
    }
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

  togglePause: (): void =>
    set((state) => ({
      ui: { ...state.ui, paused: !state.ui.paused },
    })),

  flipBoard: (): void =>
    set((state) => ({
      chess: {
        ...state.chess,
        perspective: state.chess.perspective === 'white' ? 'black' : 'white',
      },
    })),

  toggleToolExpand: (id): void =>
    set((state) => ({
      toolCalls: state.toolCalls.map((call) =>
        call.id === id ? { ...call, expanded: !call.expanded } : call,
      ),
    })),

  scrollLLM: (delta): void =>
    set((state) => ({
      llm: {
        ...state.llm,
        scrollPosition: Math.max(0, state.llm.scrollPosition + delta),
      },
    })),

  highlightPVLine: (line): void =>
    set((state) => ({
      engine: { ...state.engine, highlightedLine: line },
    })),

  reset: (): void =>
    set({
      chess: initialChessState,
      moveHistory: [],
      llm: initialLLMState,
      toolCalls: [],
      engine: initialEngineState,
      exploration: null,
      themes: [],
      criticalMoments: [],
      phase: null,
      session: { active: false },
      ui: initialUIState,
    }),
}));
