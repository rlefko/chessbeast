/**
 * Tests for Debug GUI event types and utilities
 */

import { describe, it, expect } from 'vitest';

import { isDebugEvent, parseDebugEvent, type DebugGuiEvent } from '../shared/events.js';

describe('isDebugEvent', () => {
  it('returns true for valid debug events', () => {
    const event = {
      type: 'position:update',
      timestamp: Date.now(),
      sessionId: 'test-session',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moveNotation: '1. e4',
      moveNumber: 1,
      isWhiteMove: true,
    };

    expect(isDebugEvent(event)).toBe(true);
  });

  it('returns false for objects missing type', () => {
    const event = {
      timestamp: Date.now(),
      sessionId: 'test-session',
    };

    expect(isDebugEvent(event)).toBe(false);
  });

  it('returns false for objects missing timestamp', () => {
    const event = {
      type: 'position:update',
      sessionId: 'test-session',
    };

    expect(isDebugEvent(event)).toBe(false);
  });

  it('returns false for objects missing sessionId', () => {
    const event = {
      type: 'position:update',
      timestamp: Date.now(),
    };

    expect(isDebugEvent(event)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDebugEvent(null)).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isDebugEvent('string')).toBe(false);
    expect(isDebugEvent(123)).toBe(false);
    expect(isDebugEvent(undefined)).toBe(false);
  });
});

describe('parseDebugEvent', () => {
  it('parses valid JSON debug events', () => {
    const event: DebugGuiEvent = {
      type: 'session:start',
      timestamp: Date.now(),
      sessionId: 'test-session',
      gameMetadata: {
        white: 'Player1',
        black: 'Player2',
        totalMoves: 40,
      },
    };

    const result = parseDebugEvent(JSON.stringify(event));
    expect(result).not.toBeNull();
    expect(result?.type).toBe('session:start');
  });

  it('returns null for invalid JSON', () => {
    expect(parseDebugEvent('not valid json')).toBeNull();
  });

  it('returns null for valid JSON that is not a debug event', () => {
    expect(parseDebugEvent('{"foo": "bar"}')).toBeNull();
  });

  it('parses phase events correctly', () => {
    const event = {
      type: 'phase:start',
      timestamp: Date.now(),
      sessionId: 'test-session',
      phase: 'deep_analysis',
      phaseName: 'Engine Exploration',
      totalMoves: 30,
    };

    const result = parseDebugEvent(JSON.stringify(event));
    expect(result).not.toBeNull();
    expect(result?.type).toBe('phase:start');
  });

  it('parses LLM stream events correctly', () => {
    const event = {
      type: 'llm:stream_chunk',
      timestamp: Date.now(),
      sessionId: 'test-session',
      chunkType: 'content',
      text: 'This move attacks the center.',
      done: false,
    };

    const result = parseDebugEvent(JSON.stringify(event));
    expect(result).not.toBeNull();
    expect(result?.type).toBe('llm:stream_chunk');
  });

  it('parses annotation:intent events with the full descriptor', () => {
    const event: DebugGuiEvent = {
      type: 'annotation:intent',
      timestamp: Date.now(),
      sessionId: 'test-session',
      plyIndex: 17,
      moveNotation: '9. Nd5',
      intentType: 'tactical_shot',
      priority: 3.5,
      mandatory: false,
    };

    const result = parseDebugEvent(JSON.stringify(event));
    expect(result).not.toBeNull();
    expect(result?.type).toBe('annotation:intent');
    if (result?.type === 'annotation:intent') {
      expect(result.plyIndex).toBe(17);
      expect(result.moveNotation).toBe('9. Nd5');
      expect(result.priority).toBeCloseTo(3.5, 6);
    }
  });

  it('parses annotation:comment events including filter outcomes', () => {
    const event: DebugGuiEvent = {
      type: 'annotation:comment',
      timestamp: Date.now(),
      sessionId: 'test-session',
      plyIndex: 22,
      moveNotation: '11... exd5',
      comment: 'Opening the e-file at the right moment.',
      nags: ['$1'],
      filtered: undefined,
    };

    const result = parseDebugEvent(JSON.stringify(event));
    expect(result).not.toBeNull();
    expect(result?.type).toBe('annotation:comment');
    if (result?.type === 'annotation:comment') {
      expect(result.comment).toBe('Opening the e-file at the right moment.');
      expect(result.nags).toEqual(['$1']);
    }
  });

  it('parses llm:stream_end events with structured tokens and cost', () => {
    const event: DebugGuiEvent = {
      type: 'llm:stream_end',
      timestamp: Date.now(),
      sessionId: 'test-session',
      tokensUsed: { prompt: 100, completion: 25, reasoning: 8 },
      cost: 0.0021,
      durationMs: 640,
    };

    const result = parseDebugEvent(JSON.stringify(event));
    expect(result).not.toBeNull();
    if (result?.type === 'llm:stream_end') {
      expect(result.tokensUsed).toEqual({ prompt: 100, completion: 25, reasoning: 8 });
      expect(result.cost).toBeCloseTo(0.0021, 8);
    }
  });

  it('returns null for malformed JSON payloads', () => {
    expect(parseDebugEvent('{"type": "annotation:intent", "plyIndex": ')).toBeNull();
    expect(parseDebugEvent('')).toBeNull();
    expect(parseDebugEvent('[1, 2, 3')).toBeNull();
  });
});
