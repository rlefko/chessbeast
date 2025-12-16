/**
 * Debug GUI Event Emitter
 *
 * Singleton event emitter used by CLI components to emit debug events.
 * Events are broadcast to all connected WebSocket clients.
 */

import { EventEmitter } from 'events';
import type {
  DebugGuiEvent,
  PositionUpdateEvent,
  MoveHistoryEvent,
  LLMStreamStartEvent,
  LLMStreamChunkEvent,
  LLMStreamEndEvent,
  ToolCallStartEvent,
  ToolCallResultEvent,
  EngineAnalysisEvent,
  EngineCriticalMomentEvent,
  EngineExplorationProgressEvent,
  ThemeDetectedEvent,
  PhaseStartEvent,
  PhaseProgressEvent,
  PhaseCompleteEvent,
  SessionStartEvent,
  SessionEndEvent,
} from '../shared/events.js';

type EventWithoutMeta<T> = Omit<T, 'type' | 'timestamp' | 'sessionId'>;

/**
 * Typed event emitter for Debug GUI events.
 * Used by CLI components to emit events that get broadcast to WebSocket clients.
 */
export class DebugGuiEventEmitter extends EventEmitter {
  private sessionId: string;
  private enabled: boolean = false;

  constructor() {
    super();
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Enable event emission (called when --debug-gui flag is used)
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable event emission
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Check if event emission is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Reset session ID (for new analysis runs)
   */
  resetSession(): void {
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Emit a debug event with automatic timestamp and session ID
   */
  emitEvent<T extends DebugGuiEvent>(event: T): boolean {
    if (!this.enabled) return false;
    return super.emit('debug-event', {
      ...event,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    });
  }

  // =========================================================================
  // Position Events
  // =========================================================================

  positionUpdate(data: EventWithoutMeta<PositionUpdateEvent>): void {
    this.emitEvent({ type: 'position:update', ...data } as PositionUpdateEvent);
  }

  moveHistory(data: EventWithoutMeta<MoveHistoryEvent>): void {
    this.emitEvent({ type: 'position:move_history', ...data } as MoveHistoryEvent);
  }

  // =========================================================================
  // LLM Events
  // =========================================================================

  llmStreamStart(data: {
    streamId: string;
    moveNotation?: string;
    intentType?: string;
    model?: string;
  }): void {
    this.emitEvent({
      type: 'llm:stream_start',
      moveNotation: data.moveNotation ?? '',
      intentType: data.intentType,
      model: data.model,
    } as LLMStreamStartEvent);
  }

  llmStreamChunk(data: {
    streamId: string;
    chunkType: 'thinking' | 'content' | 'tool_call';
    content: string;
    done?: boolean;
  }): void {
    this.emitEvent({
      type: 'llm:stream_chunk',
      chunkType: data.chunkType,
      text: data.content,
      done: data.done ?? false,
    } as LLMStreamChunkEvent);
  }

  llmStreamEnd(data: {
    streamId: string;
    finalContent?: string;
    tokensUsed?: number;
    durationMs: number;
    error?: string;
  }): void {
    this.emitEvent({
      type: 'llm:stream_end',
      finalComment: data.finalContent,
      tokensUsed: data.tokensUsed !== undefined ? { prompt: 0, completion: data.tokensUsed } : undefined,
      durationMs: data.durationMs,
    } as LLMStreamEndEvent);
  }

  // =========================================================================
  // Tool Call Events
  // =========================================================================

  toolCallStart(data: {
    callId: string;
    toolName: string;
    arguments: Record<string, unknown>;
    iteration?: number;
    maxIterations?: number;
    context?: { currentFen?: string; currentLine?: string[]; depth?: number };
  }): void {
    this.emitEvent({
      type: 'tool:call_start',
      toolName: data.toolName,
      toolArgs: data.arguments,
      iteration: data.iteration ?? 1,
      maxIterations: data.maxIterations ?? 1,
      context: data.context,
    } as ToolCallStartEvent);
  }

  toolCallResult(data: {
    callId: string;
    toolName: string;
    success: boolean;
    result?: unknown;
    error?: string;
    durationMs: number;
  }): void {
    this.emitEvent({
      type: 'tool:call_result',
      toolName: data.toolName,
      success: data.success,
      result: data.result,
      error: data.error,
      durationMs: data.durationMs,
    } as ToolCallResultEvent);
  }

  // =========================================================================
  // Engine Events
  // =========================================================================

  engineAnalysis(data: EventWithoutMeta<EngineAnalysisEvent>): void {
    this.emitEvent({ type: 'engine:analysis', ...data } as EngineAnalysisEvent);
  }

  engineCriticalMoment(data: EventWithoutMeta<EngineCriticalMomentEvent>): void {
    this.emitEvent({ type: 'engine:critical_moment', ...data } as EngineCriticalMomentEvent);
  }

  engineExplorationProgress(data: EventWithoutMeta<EngineExplorationProgressEvent>): void {
    this.emitEvent({
      type: 'engine:exploration_progress',
      ...data,
    } as EngineExplorationProgressEvent);
  }

  themeDetected(data: EventWithoutMeta<ThemeDetectedEvent>): void {
    this.emitEvent({ type: 'engine:theme_detected', ...data } as ThemeDetectedEvent);
  }

  // =========================================================================
  // Phase Events
  // =========================================================================

  phaseStart(phase: string, phaseName: string, totalMoves?: number): void {
    this.emitEvent({
      type: 'phase:start',
      phase,
      phaseName,
      totalMoves,
    } as PhaseStartEvent);
  }

  phaseProgress(phase: string, current: number, total: number, detail?: string): void {
    this.emitEvent({
      type: 'phase:progress',
      phase,
      current,
      total,
      detail,
    } as PhaseProgressEvent);
  }

  phaseComplete(phase: string, durationMs: number, detail?: string): void {
    this.emitEvent({
      type: 'phase:complete',
      phase,
      durationMs,
      detail,
    } as PhaseCompleteEvent);
  }

  // =========================================================================
  // Session Events
  // =========================================================================

  sessionStart(
    gameMetadata: SessionStartEvent['gameMetadata'],
  ): void {
    this.emitEvent({
      type: 'session:start',
      gameMetadata,
    } as SessionStartEvent);
  }

  sessionEnd(stats: SessionEndEvent['stats']): void {
    this.emitEvent({
      type: 'session:end',
      stats,
    } as SessionEndEvent);
  }
}

/**
 * Singleton instance for CLI integration.
 * Import this instance in CLI components to emit debug events.
 */
export const debugGuiEmitter = new DebugGuiEventEmitter();
