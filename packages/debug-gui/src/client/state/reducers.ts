/**
 * Pure per-domain reducers for the Debug GUI store.
 *
 * Each reducer takes its domain state and an incoming WebSocket event and
 * returns the next state, returning the SAME reference when the event does
 * not affect that domain (so Zustand slice selectors skip re-renders).
 *
 * All reducers reset their domain on `session:start` (data resets, while
 * connection/UI state — owned by the store — is preserved).
 */

import type { DebugGuiEvent } from '../../shared/events.js';

// =============================================================================
// Domain State Interfaces
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

export interface LLMTokenTotals {
  input: number;
  output: number;
  reasoning: number;
}

export interface LLMSessionTotals extends LLMTokenTotals {
  /** Number of completed streams this session */
  streams: number;
  /** Cumulative session cost in dollars */
  cost: number;
}

export interface LLMState {
  currentMove: string;
  intentType?: string | undefined;
  model?: string | undefined;
  isStreaming: boolean;
  isThinking: boolean;
  /** Accumulated reasoning text (tail-capped) */
  reasoning: string;
  /** Accumulated content text (tail-capped) */
  content: string;
  /** Token counts for the last completed stream */
  lastTokens: LLMTokenTotals;
  /** Cost of the last completed stream in dollars */
  lastCost: number;
  /** Cumulative session totals across all streams */
  totals: LLMSessionTotals;
  /** Scroll offset from the tail (0 = follow live output) */
  scrollOffset: number;
}

export interface PVLine {
  rank: number;
  move: string;
  evaluation: { cp?: number | undefined; mate?: number | undefined };
  pv: string[];
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
  /** Whether any engine:analysis event has arrived yet */
  hasData: boolean;
}

export interface ExplorationState {
  nodesExplored: number;
  maxNodes: number;
  currentDepth: number;
  phase: string;
  themesDetected: number;
  intentsGenerated: number;
}

export interface DetectedTheme {
  name: string;
  lifecycle: 'emerged' | 'persisting' | 'escalated' | 'resolved';
  fen: string;
  description?: string | undefined;
  timestamp: number;
}

export interface CriticalMoment {
  plyIndex: number;
  type: string;
  score: number;
  reason: string;
}

export interface EngineDomainState {
  engine: EngineState;
  exploration: ExplorationState | null;
  themes: DetectedTheme[];
  criticalMoments: CriticalMoment[];
}

export type AnnotationStatus = 'pending' | 'done' | 'filtered';

export interface AnnotationItem {
  plyIndex: number;
  moveNotation: string;
  intentType: string;
  priority: number;
  mandatory: boolean;
  status: AnnotationStatus;
  comment?: string | undefined;
  filtered?: 'density' | 'redundancy' | 'cap' | undefined;
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
        nodesExplored?: number | undefined;
      }
    | undefined;
}

export interface SessionDomainState {
  session: SessionState;
  phase: PhaseState | null;
}

// =============================================================================
// Limits
// =============================================================================

/** Cap accumulated LLM text (reasoning/content), keeping the tail */
export const MAX_LLM_TEXT_LENGTH = 8192;

/** Maximum annotation queue entries kept */
export const MAX_ANNOTATIONS = 100;

/** Maximum detected themes kept */
export const MAX_THEMES = 50;

// =============================================================================
// Initial States
// =============================================================================

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const initialChessState: ChessState = {
  fen: STARTING_FEN,
  moveNotation: 'Starting position',
  moveNumber: 0,
  isWhiteMove: true,
  perspective: 'white',
};

export const initialLLMState: LLMState = {
  currentMove: '',
  isStreaming: false,
  isThinking: false,
  reasoning: '',
  content: '',
  lastTokens: { input: 0, output: 0, reasoning: 0 },
  lastCost: 0,
  totals: { streams: 0, input: 0, output: 0, reasoning: 0, cost: 0 },
  scrollOffset: 0,
};

export const initialEngineState: EngineState = {
  fen: STARTING_FEN,
  depth: 0,
  nodes: 0,
  nps: 0,
  evaluation: { cp: 0 },
  pv: [],
  multipv: [],
  highlightedLine: null,
  hasData: false,
};

export const initialEngineDomainState: EngineDomainState = {
  engine: initialEngineState,
  exploration: null,
  themes: [],
  criticalMoments: [],
};

export const initialSessionDomainState: SessionDomainState = {
  session: { active: false },
  phase: null,
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Keep the tail of a string within the given cap
 */
export function capTail(text: string, maxLength: number = MAX_LLM_TEXT_LENGTH): string {
  return text.length > maxLength ? text.slice(text.length - maxLength) : text;
}

/**
 * Append batched thinking/content text to the LLM state, applying tail caps.
 * Used by the store's chunk batching (flushes buffered chunks in one update).
 */
export function appendLlmText(
  state: LLMState,
  thinkingText: string,
  contentText: string,
  lastChunkType: 'thinking' | 'content' | null,
): LLMState {
  if (thinkingText.length === 0 && contentText.length === 0) return state;
  return {
    ...state,
    isThinking: lastChunkType !== null ? lastChunkType === 'thinking' : state.isThinking,
    reasoning: thinkingText ? capTail(state.reasoning + thinkingText) : state.reasoning,
    content: contentText ? capTail(state.content + contentText) : state.content,
  };
}

// =============================================================================
// Reducers
// =============================================================================

/**
 * Chess board domain: position updates. Preserves the user-chosen board
 * perspective across session resets.
 */
export function reduceChess(state: ChessState, event: DebugGuiEvent): ChessState {
  switch (event.type) {
    case 'position:update':
      return {
        ...state,
        fen: event.fen,
        moveNotation: event.moveNotation,
        moveNumber: event.moveNumber,
        isWhiteMove: event.isWhiteMove,
        evaluation: event.evaluation,
        bestMove: event.bestMove,
        classification: event.classification,
        cpLoss: event.cpLoss,
      };

    case 'session:start':
      return { ...initialChessState, perspective: state.perspective };

    default:
      return state;
  }
}

/**
 * LLM stream domain: stream lifecycle and cumulative session totals.
 * Note: `llm:stream_chunk` appends are batched by the store (appendLlmText),
 * but this reducer also handles them directly for replay and tests.
 */
export function reduceLlm(state: LLMState, event: DebugGuiEvent): LLMState {
  switch (event.type) {
    case 'llm:stream_start':
      return {
        ...state,
        currentMove: event.moveNotation,
        intentType: event.intentType,
        model: event.model ?? state.model,
        isStreaming: true,
        isThinking: false,
        reasoning: '',
        content: '',
        scrollOffset: 0,
      };

    case 'llm:stream_chunk':
      return appendLlmText(
        state,
        event.chunkType === 'thinking' ? event.text : '',
        event.chunkType === 'content' ? event.text : '',
        event.chunkType,
      );

    case 'llm:stream_end': {
      const tokens: LLMTokenTotals = event.tokensUsed
        ? {
            input: event.tokensUsed.prompt,
            output: event.tokensUsed.completion,
            reasoning: event.tokensUsed.reasoning ?? 0,
          }
        : { input: 0, output: 0, reasoning: 0 };
      const cost = event.cost ?? 0;
      return {
        ...state,
        isStreaming: false,
        isThinking: false,
        content: capTail(event.finalComment ?? state.content),
        lastTokens: tokens,
        lastCost: cost,
        totals: {
          streams: state.totals.streams + 1,
          input: state.totals.input + tokens.input,
          output: state.totals.output + tokens.output,
          reasoning: state.totals.reasoning + tokens.reasoning,
          cost: state.totals.cost + cost,
        },
      };
    }

    case 'session:start':
      return initialLLMState;

    default:
      return state;
  }
}

/**
 * Engine domain: analysis snapshots, exploration progress, themes, and
 * critical moments.
 */
export function reduceEngine(state: EngineDomainState, event: DebugGuiEvent): EngineDomainState {
  switch (event.type) {
    case 'engine:analysis':
      return {
        ...state,
        engine: {
          ...state.engine,
          fen: event.fen,
          depth: event.depth,
          nodes: event.nodes,
          nps: event.nps ?? 0,
          evaluation: event.evaluation,
          pv: event.pv,
          multipv: event.multipv ?? [],
          hasData: true,
        },
      };

    case 'engine:critical_moment':
      return {
        ...state,
        criticalMoments: [
          ...state.criticalMoments,
          {
            plyIndex: event.plyIndex,
            type: event.momentType,
            score: event.score,
            reason: event.reason,
          },
        ],
      };

    case 'engine:exploration_progress':
      return {
        ...state,
        exploration: {
          nodesExplored: event.nodesExplored,
          maxNodes: event.maxNodes,
          currentDepth: event.currentDepth,
          phase: event.phase,
          themesDetected: event.themesDetected ?? 0,
          intentsGenerated: event.intentsGenerated ?? 0,
        },
      };

    case 'engine:theme_detected': {
      const newTheme: DetectedTheme = {
        name: event.themeName,
        lifecycle: event.lifecycle,
        fen: event.fen,
        description: event.description,
        timestamp: event.timestamp,
      };
      return {
        ...state,
        themes: [...state.themes, newTheme].slice(-MAX_THEMES),
      };
    }

    case 'session:start':
      return initialEngineDomainState;

    default:
      return state;
  }
}

/**
 * Annotation domain: the intent queue (keyed by plyIndex, bounded) and the
 * per-ply narration outcomes (done/filtered).
 */
export function reduceAnnotations(state: AnnotationItem[], event: DebugGuiEvent): AnnotationItem[] {
  switch (event.type) {
    case 'annotation:intent': {
      const index = state.findIndex((item) => item.plyIndex === event.plyIndex);
      if (index >= 0) {
        const existing = state[index]!;
        // Keep the highest-priority intent's descriptor for this ply
        if (event.priority <= existing.priority) return state;
        const updated = [...state];
        updated[index] = {
          ...existing,
          moveNotation: event.moveNotation,
          intentType: event.intentType,
          priority: event.priority,
          mandatory: existing.mandatory || event.mandatory,
        };
        return updated;
      }
      const item: AnnotationItem = {
        plyIndex: event.plyIndex,
        moveNotation: event.moveNotation,
        intentType: event.intentType,
        priority: event.priority,
        mandatory: event.mandatory,
        status: 'pending',
      };
      return [...state, item].slice(-MAX_ANNOTATIONS);
    }

    case 'annotation:comment': {
      const status: AnnotationStatus = event.filtered !== undefined ? 'filtered' : 'done';
      const index = state.findIndex((item) => item.plyIndex === event.plyIndex);
      if (index >= 0) {
        const existing = state[index]!;
        const updated = [...state];
        updated[index] = {
          ...existing,
          status,
          comment: event.comment || existing.comment,
          filtered: event.filtered,
          ...(event.moveNotation !== undefined ? { moveNotation: event.moveNotation } : {}),
        };
        return updated;
      }
      const item: AnnotationItem = {
        plyIndex: event.plyIndex,
        moveNotation: event.moveNotation ?? `ply ${event.plyIndex}`,
        intentType: 'unknown',
        priority: 0,
        mandatory: false,
        status,
        comment: event.comment,
        filtered: event.filtered,
      };
      return [...state, item].slice(-MAX_ANNOTATIONS);
    }

    case 'session:start':
      return [];

    default:
      return state;
  }
}

/**
 * Session domain: session lifecycle and pipeline phase progress.
 */
export function reduceSession(state: SessionDomainState, event: DebugGuiEvent): SessionDomainState {
  switch (event.type) {
    case 'session:start':
      return {
        session: { active: true, gameMetadata: event.gameMetadata },
        phase: null,
      };

    case 'session:end':
      return {
        ...state,
        session: { ...state.session, active: false, stats: event.stats },
      };

    case 'phase:start':
      return {
        ...state,
        phase: {
          current: event.phase,
          name: event.phaseName,
          progress: 0,
          total: event.totalMoves ?? 0,
          startTime: event.timestamp,
        },
      };

    case 'phase:progress':
      if (!state.phase) return state;
      return {
        ...state,
        phase: {
          ...state.phase,
          progress: event.current,
          total: event.total,
          detail: event.detail,
        },
      };

    case 'phase:complete':
      if (!state.phase) return state;
      return {
        ...state,
        phase: {
          ...state.phase,
          progress: state.phase.total,
          detail: event.detail,
        },
      };

    default:
      return state;
  }
}
