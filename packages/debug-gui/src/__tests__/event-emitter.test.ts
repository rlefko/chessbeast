/**
 * Tests for the Debug GUI event emitter: enable gating, session stamping,
 * and full payload passthrough for the LLM stream end event.
 */

import { describe, it, expect, vi } from 'vitest';

import { DebugGuiEventEmitter } from '../server/event-emitter.js';
import type {
  AnnotationCommentEvent,
  AnnotationIntentEvent,
  DebugGuiEvent,
  LLMStreamEndEvent,
  PositionUpdateEvent,
} from '../shared/events.js';

function createEmitter(): { emitter: DebugGuiEventEmitter; events: DebugGuiEvent[] } {
  const emitter = new DebugGuiEventEmitter();
  const events: DebugGuiEvent[] = [];
  emitter.on('debug-event', (event: DebugGuiEvent) => events.push(event));
  return { emitter, events };
}

describe('DebugGuiEventEmitter', () => {
  it('is disabled by default and drops all events', () => {
    const { emitter, events } = createEmitter();
    expect(emitter.isEnabled()).toBe(false);

    emitter.positionUpdate({
      fen: 'fen',
      moveNotation: '1. e4',
      moveNumber: 1,
      isWhiteMove: true,
    });
    emitter.llmStreamEnd({ streamId: 's1', durationMs: 10 });

    expect(events).toHaveLength(0);
  });

  it('emits events once enabled and stops after disable', () => {
    const { emitter, events } = createEmitter();
    emitter.enable();
    emitter.phaseStart('deep_analysis', 'Engine Exploration', 30);
    emitter.disable();
    emitter.phaseStart('llm_annotation', 'LLM Annotation');

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('phase:start');
  });

  it('stamps every event with a timestamp and the current session ID', () => {
    vi.useFakeTimers();
    vi.setSystemTime(123456789);
    try {
      const { emitter, events } = createEmitter();
      emitter.enable();
      emitter.engineCriticalMoment({ plyIndex: 3, momentType: 'blunder', score: 9, reason: 'x' });

      expect(events[0]?.sessionId).toBe(emitter.getSessionId());
      expect(events[0]?.timestamp).toBe(123456789);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resetSession issues a new session ID used for subsequent events', () => {
    const { emitter, events } = createEmitter();
    emitter.enable();

    const firstId = emitter.getSessionId();
    emitter.sessionStart({ white: 'A', black: 'B', totalMoves: 10 });

    emitter.resetSession();
    const secondId = emitter.getSessionId();
    emitter.sessionStart({ white: 'C', black: 'D', totalMoves: 20 });

    expect(secondId).not.toBe(firstId);
    expect(events[0]?.sessionId).toBe(firstId);
    expect(events[1]?.sessionId).toBe(secondId);
  });

  it('passes full token and cost accounting through llmStreamEnd', () => {
    const { emitter, events } = createEmitter();
    emitter.enable();

    emitter.llmStreamEnd({
      streamId: 's1',
      finalContent: 'A precise move.',
      tokensUsed: { prompt: 120, completion: 45, reasoning: 30 },
      cost: 0.00375,
      durationMs: 900,
    });

    const event = events[0] as LLMStreamEndEvent;
    expect(event.type).toBe('llm:stream_end');
    expect(event.finalComment).toBe('A precise move.');
    expect(event.tokensUsed).toEqual({ prompt: 120, completion: 45, reasoning: 30 });
    expect(event.cost).toBeCloseTo(0.00375, 8);
    expect(event.durationMs).toBe(900);
  });

  it('propagates stream errors through llmStreamEnd', () => {
    const { emitter, events } = createEmitter();
    emitter.enable();
    emitter.llmStreamEnd({ streamId: 's1', durationMs: 5, error: 'rate limited' });

    const event = events[0] as LLMStreamEndEvent;
    expect(event.error).toBe('rate limited');
    expect(event.tokensUsed).toBeUndefined();
  });

  it('emits annotation:intent events with the full intent descriptor', () => {
    const { emitter, events } = createEmitter();
    emitter.enable();
    emitter.annotationIntent({
      plyIndex: 9,
      moveNotation: '5. Bxf7+',
      intentType: 'tactical_shot',
      priority: 4.2,
      mandatory: true,
    });

    const event = events[0] as AnnotationIntentEvent;
    expect(event.type).toBe('annotation:intent');
    expect(event.plyIndex).toBe(9);
    expect(event.moveNotation).toBe('5. Bxf7+');
    expect(event.intentType).toBe('tactical_shot');
    expect(event.priority).toBeCloseTo(4.2, 6);
    expect(event.mandatory).toBe(true);
  });

  it('emits annotation:comment events including filter outcomes', () => {
    const { emitter, events } = createEmitter();
    emitter.enable();
    emitter.annotationComment({
      plyIndex: 12,
      moveNotation: '6... h6',
      comment: '',
      filtered: 'redundancy',
    });

    const event = events[0] as AnnotationCommentEvent;
    expect(event.type).toBe('annotation:comment');
    expect(event.plyIndex).toBe(12);
    expect(event.filtered).toBe('redundancy');
  });

  it('emits position updates with evaluation payloads intact', () => {
    const { emitter, events } = createEmitter();
    emitter.enable();
    emitter.positionUpdate({
      fen: 'some-fen',
      moveNotation: '10. Qd3',
      moveNumber: 10,
      isWhiteMove: true,
      evaluation: { cp: 85 },
      classification: 'good',
    });

    const event = events[0] as PositionUpdateEvent;
    expect(event.evaluation).toEqual({ cp: 85 });
    expect(event.classification).toBe('good');
  });
});
