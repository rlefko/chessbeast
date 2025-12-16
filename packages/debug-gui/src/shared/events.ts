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

export interface MoveHistoryEvent extends DebugEvent {
  type: 'position:move_history';
  moves: Array<{
    notation: string;
    moveNumber: number;
    isWhite: boolean;
    evaluation?: number;
    classification?: string;
  }>;
}

// =============================================================================
// LLM Streaming Events
// =============================================================================

export interface LLMStreamStartEvent extends DebugEvent {
  type: 'llm:stream_start';
  moveNotation: string;
  intentType?: string;
  model?: string;
}

export interface LLMStreamChunkEvent extends DebugEvent {
  type: 'llm:stream_chunk';
  chunkType: 'thinking' | 'content' | 'tool_call';
  text: string;
  done: boolean;
}

export interface LLMStreamEndEvent extends DebugEvent {
  type: 'llm:stream_end';
  finalComment?: string;
  tokensUsed?: {
    prompt: number;
    completion: number;
    reasoning?: number;
  };
  cost?: number;
  durationMs: number;
}

// =============================================================================
// Tool Call Events
// =============================================================================

export interface ToolCallStartEvent extends DebugEvent {
  type: 'tool:call_start';
  toolName: string;
  toolArgs: Record<string, unknown>;
  iteration: number;
  maxIterations: number;
  context?: {
    currentFen?: string;
    currentLine?: string[];
    depth?: number;
  };
}

export interface ToolCallResultEvent extends DebugEvent {
  type: 'tool:call_result';
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
}

// =============================================================================
// Engine Analysis Events
// =============================================================================

export interface EngineAnalysisEvent extends DebugEvent {
  type: 'engine:analysis';
  fen: string;
  depth: number;
  nodes: number;
  nps?: number;
  evaluation: {
    cp?: number;
    mate?: number;
  };
  pv: string[];
  multipv?: Array<{
    rank: number;
    move: string;
    evaluation: { cp?: number; mate?: number };
    pv: string[];
  }>;
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
  themesDetected?: number;
  intentsGenerated?: number;
}

export interface ThemeDetectedEvent extends DebugEvent {
  type: 'engine:theme_detected';
  themeName: string;
  lifecycle: 'emerged' | 'persisting' | 'escalated' | 'resolved';
  fen: string;
  description?: string;
}

// =============================================================================
// Pipeline Phase Events
// =============================================================================

export interface PhaseStartEvent extends DebugEvent {
  type: 'phase:start';
  phase: string;
  phaseName: string;
  totalMoves?: number;
}

export interface PhaseProgressEvent extends DebugEvent {
  type: 'phase:progress';
  phase: string;
  current: number;
  total: number;
  detail?: string;
}

export interface PhaseCompleteEvent extends DebugEvent {
  type: 'phase:complete';
  phase: string;
  durationMs: number;
  detail?: string;
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
  | MoveHistoryEvent
  | LLMStreamStartEvent
  | LLMStreamChunkEvent
  | LLMStreamEndEvent
  | ToolCallStartEvent
  | ToolCallResultEvent
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
