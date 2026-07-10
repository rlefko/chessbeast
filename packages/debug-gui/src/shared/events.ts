/**
 * WebSocket Event Types for Debug GUI
 *
 * These events flow from the CLI analysis process to the Debug GUI client.
 * All events share a common base structure with timestamp and session ID.
 */

/**
 * Base event structure
 */
export interface DebugEvent {
  type: string;
  timestamp: number;
  sessionId: string;
}

// =============================================================================
// Position Events
// =============================================================================

export interface PositionUpdateEvent extends DebugEvent {
  type: 'position:update';
  fen: string;
  moveNotation: string;
  moveNumber: number;
  isWhiteMove: boolean;
  evaluation?:
    | {
        cp?: number | undefined;
        mate?: number | undefined;
      }
    | undefined;
  bestMove?: string | undefined;
  classification?: string | undefined;
  cpLoss?: number | undefined;
}

// =============================================================================
// LLM Streaming Events
// =============================================================================

export interface LLMStreamStartEvent extends DebugEvent {
  type: 'llm:stream_start';
  moveNotation: string;
  intentType?: string | undefined;
  model?: string | undefined;
}

export interface LLMStreamChunkEvent extends DebugEvent {
  type: 'llm:stream_chunk';
  chunkType: 'thinking' | 'content';
  text: string;
  done: boolean;
}

export interface LLMStreamEndEvent extends DebugEvent {
  type: 'llm:stream_end';
  finalComment?: string | undefined;
  tokensUsed?:
    | {
        prompt: number;
        completion: number;
        reasoning?: number | undefined;
      }
    | undefined;
  cost?: number | undefined;
  durationMs: number;
  error?: string | undefined;
}

// =============================================================================
// Annotation Events
// =============================================================================

/**
 * A comment intent produced by the engine-driven exploration phase.
 * These populate the annotation queue before narration begins.
 */
export interface AnnotationIntentEvent extends DebugEvent {
  type: 'annotation:intent';
  /** Ply of the position AFTER the move (comment attachment convention) */
  plyIndex: number;
  /** Notation of the move being annotated (e.g., "12... Nxe4") */
  moveNotation: string;
  /** Intent type (e.g., "blunder_explanation", "tactical_shot") */
  intentType: string;
  /** Priority score (higher = more important) */
  priority: number;
  /** Whether this intent is mandatory (e.g., blunders) */
  mandatory: boolean;
}

/**
 * A generated comment from the post-write narration phase.
 */
export interface AnnotationCommentEvent extends DebugEvent {
  type: 'annotation:comment';
  /** Ply of the position AFTER the move (comment attachment convention) */
  plyIndex: number;
  /** Notation of the move being annotated, when known */
  moveNotation?: string | undefined;
  /** The generated comment text */
  comment: string;
  /** NAGs attached to this ply, if any */
  nags?: string[] | undefined;
  /** Set when the intent was filtered out instead of narrated */
  filtered?: 'density' | 'redundancy' | 'cap' | undefined;
}

// =============================================================================
// Engine Analysis Events
// =============================================================================

export interface EngineAnalysisEvent extends DebugEvent {
  type: 'engine:analysis';
  fen: string;
  depth: number;
  nodes: number;
  nps?: number | undefined;
  evaluation: {
    cp?: number | undefined;
    mate?: number | undefined;
  };
  pv: string[];
  multipv?:
    | Array<{
        rank: number;
        move: string;
        evaluation: { cp?: number | undefined; mate?: number | undefined };
        pv: string[];
      }>
    | undefined;
}

export interface EngineCriticalMomentEvent extends DebugEvent {
  type: 'engine:critical_moment';
  plyIndex: number;
  momentType: string;
  score: number;
  reason: string;
}

export interface EngineExplorationProgressEvent extends DebugEvent {
  type: 'engine:exploration_progress';
  nodesExplored: number;
  maxNodes: number;
  currentDepth: number;
  phase: 'exploring' | 'detecting_themes' | 'generating_intents';
  themesDetected?: number | undefined;
  intentsGenerated?: number | undefined;
}

export interface ThemeDetectedEvent extends DebugEvent {
  type: 'engine:theme_detected';
  themeName: string;
  lifecycle: 'emerged' | 'persisting' | 'escalated' | 'resolved';
  fen: string;
  description?: string | undefined;
}

// =============================================================================
// Pipeline Phase Events
// =============================================================================

export interface PhaseStartEvent extends DebugEvent {
  type: 'phase:start';
  phase: string;
  phaseName: string;
  totalMoves?: number | undefined;
}

export interface PhaseProgressEvent extends DebugEvent {
  type: 'phase:progress';
  phase: string;
  current: number;
  total: number;
  detail?: string | undefined;
}

export interface PhaseCompleteEvent extends DebugEvent {
  type: 'phase:complete';
  phase: string;
  durationMs: number;
  detail?: string | undefined;
}

// =============================================================================
// Session Events
// =============================================================================

export interface SessionStartEvent extends DebugEvent {
  type: 'session:start';
  gameMetadata: {
    white: string;
    black: string;
    totalMoves: number;
    event?: string | undefined;
    date?: string | undefined;
    result?: string | undefined;
  };
}

export interface SessionEndEvent extends DebugEvent {
  type: 'session:end';
  stats: {
    gamesAnalyzed: number;
    criticalMoments: number;
    annotationsGenerated: number;
    totalTimeMs: number;
    totalCost?: number | undefined;
    nodesExplored?: number | undefined;
  };
}

// =============================================================================
// Connection Events (client-side only)
// =============================================================================

export interface ConnectionEvent {
  type: 'connection:status';
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string;
}

// =============================================================================
// Union Type
// =============================================================================

export type DebugGuiEvent =
  | PositionUpdateEvent
  | LLMStreamStartEvent
  | LLMStreamChunkEvent
  | LLMStreamEndEvent
  | AnnotationIntentEvent
  | AnnotationCommentEvent
  | EngineAnalysisEvent
  | EngineCriticalMomentEvent
  | EngineExplorationProgressEvent
  | ThemeDetectedEvent
  | PhaseStartEvent
  | PhaseProgressEvent
  | PhaseCompleteEvent
  | SessionStartEvent
  | SessionEndEvent;

/**
 * Type guard for debug events
 */
export function isDebugEvent(obj: unknown): obj is DebugGuiEvent {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'type' in obj &&
    'timestamp' in obj &&
    'sessionId' in obj
  );
}

/**
 * Parse a JSON message into a DebugGuiEvent
 */
export function parseDebugEvent(message: string): DebugGuiEvent | null {
  try {
    const parsed = JSON.parse(message);
    if (isDebugEvent(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
