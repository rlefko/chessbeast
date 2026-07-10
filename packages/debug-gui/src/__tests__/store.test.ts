/**
 * Tests for the Debug GUI Zustand store: chunk batching, stream accounting,
 * session resets, annotation capping, pause buffering, and UI actions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { MAX_ANNOTATIONS, MAX_LLM_TEXT_LENGTH } from '../client/state/reducers.js';
import { useDebugStore, LLM_CHUNK_FLUSH_MS, MAX_PAUSED_EVENTS } from '../client/state/store.js';
import type {
  AnnotationCommentEvent,
  AnnotationIntentEvent,
  LLMStreamChunkEvent,
  LLMStreamEndEvent,
  LLMStreamStartEvent,
  PositionUpdateEvent,
  SessionStartEvent,
} from '../shared/events.js';

const meta = { timestamp: 1000, sessionId: 'test-session' };

function chunk(chunkType: 'thinking' | 'content', text: string): LLMStreamChunkEvent {
  return { type: 'llm:stream_chunk', chunkType, text, done: false, ...meta };
}

function streamStart(overrides: Partial<LLMStreamStartEvent> = {}): LLMStreamStartEvent {
  return {
    type: 'llm:stream_start',
    moveNotation: '12... Nxe4',
    intentType: 'tactical_shot',
    model: 'gpt-5-mini',
    ...meta,
    ...overrides,
  };
}

function streamEnd(overrides: Partial<LLMStreamEndEvent> = {}): LLMStreamEndEvent {
  return {
    type: 'llm:stream_end',
    durationMs: 500,
    ...meta,
    ...overrides,
  };
}

function intentEvent(
  plyIndex: number,
  overrides: Partial<AnnotationIntentEvent> = {},
): AnnotationIntentEvent {
  return {
    type: 'annotation:intent',
    plyIndex,
    moveNotation: `move-${plyIndex}`,
    intentType: 'why_this_move',
    priority: 1,
    mandatory: false,
    ...meta,
    ...overrides,
  };
}

function commentEvent(
  plyIndex: number,
  overrides: Partial<AnnotationCommentEvent> = {},
): AnnotationCommentEvent {
  return {
    type: 'annotation:comment',
    plyIndex,
    comment: `comment for ${plyIndex}`,
    ...meta,
    ...overrides,
  };
}

function positionUpdate(moveNumber: number): PositionUpdateEvent {
  return {
    type: 'position:update',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moveNotation: `${moveNumber}. e4`,
    moveNumber,
    isWhiteMove: true,
    ...meta,
  };
}

function sessionStart(): SessionStartEvent {
  return {
    type: 'session:start',
    gameMetadata: { white: 'A', black: 'B', totalMoves: 40 },
    ...meta,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  useDebugStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LLM chunk batching', () => {
  it('buffers stream chunks and flushes them in one update after the flush interval', () => {
    const store = useDebugStore.getState();
    store.processEvent(chunk('thinking', 'first '));
    store.processEvent(chunk('thinking', 'second'));

    // Nothing applied yet — chunks are buffered
    expect(useDebugStore.getState().llm.reasoning).toBe('');

    vi.advanceTimersByTime(LLM_CHUNK_FLUSH_MS + 10);
    expect(useDebugStore.getState().llm.reasoning).toBe('first second');
  });

  it('separates thinking and content chunks and tracks isThinking from the last chunk', () => {
    const store = useDebugStore.getState();
    store.processEvent(chunk('thinking', 'hmm'));
    store.processEvent(chunk('content', 'The move wins.'));
    vi.advanceTimersByTime(LLM_CHUNK_FLUSH_MS + 10);

    const llm = useDebugStore.getState().llm;
    expect(llm.reasoning).toBe('hmm');
    expect(llm.content).toBe('The move wins.');
    expect(llm.isThinking).toBe(false);
  });

  it('caps accumulated reasoning at the tail limit', () => {
    const store = useDebugStore.getState();
    const long = 'x'.repeat(MAX_LLM_TEXT_LENGTH - 10) + 'TAIL-MARKER';
    store.processEvent(chunk('thinking', long));
    vi.advanceTimersByTime(LLM_CHUNK_FLUSH_MS + 10);

    const reasoning = useDebugStore.getState().llm.reasoning;
    expect(reasoning.length).toBe(MAX_LLM_TEXT_LENGTH);
    expect(reasoning.endsWith('TAIL-MARKER')).toBe(true);
  });

  it('flushes buffered chunks before applying a non-chunk event', () => {
    const store = useDebugStore.getState();
    store.processEvent(chunk('thinking', 'buffered'));
    // No timer advance: stream_end must flush the buffer synchronously first
    store.processEvent(streamEnd());

    const llm = useDebugStore.getState().llm;
    expect(llm.reasoning).toBe('buffered');
    expect(llm.isStreaming).toBe(false);
  });
});

describe('LLM stream accounting', () => {
  it('applies finalComment and per-stream tokens/cost on stream_end', () => {
    const store = useDebugStore.getState();
    store.processEvent(streamStart());
    store.processEvent(chunk('content', 'partial'));
    store.processEvent(
      streamEnd({
        finalComment: 'Final comment.',
        tokensUsed: { prompt: 100, completion: 25, reasoning: 10 },
        cost: 0.0012,
      }),
    );

    const llm = useDebugStore.getState().llm;
    expect(llm.content).toBe('Final comment.');
    expect(llm.lastTokens).toEqual({ input: 100, output: 25, reasoning: 10 });
    expect(llm.lastCost).toBeCloseTo(0.0012, 6);
  });

  it('accumulates cumulative session totals across streams', () => {
    const store = useDebugStore.getState();
    store.processEvent(streamStart());
    store.processEvent(
      streamEnd({ tokensUsed: { prompt: 100, completion: 25, reasoning: 10 }, cost: 0.001 }),
    );
    store.processEvent(streamStart());
    store.processEvent(streamEnd({ tokensUsed: { prompt: 200, completion: 50 }, cost: 0.002 }));

    const totals = useDebugStore.getState().llm.totals;
    expect(totals.streams).toBe(2);
    expect(totals.input).toBe(300);
    expect(totals.output).toBe(75);
    expect(totals.reasoning).toBe(10);
    expect(totals.cost).toBeCloseTo(0.003, 6);
  });

  it('resets stream text and header fields on stream_start', () => {
    const store = useDebugStore.getState();
    store.processEvent(chunk('thinking', 'old text'));
    vi.advanceTimersByTime(LLM_CHUNK_FLUSH_MS + 10);
    store.processEvent(streamStart({ moveNotation: '3. Nf3', intentType: 'why_this_move' }));

    const llm = useDebugStore.getState().llm;
    expect(llm.reasoning).toBe('');
    expect(llm.content).toBe('');
    expect(llm.currentMove).toBe('3. Nf3');
    expect(llm.intentType).toBe('why_this_move');
    expect(llm.model).toBe('gpt-5-mini');
    expect(llm.isStreaming).toBe(true);
  });
});

describe('session:start reset semantics', () => {
  it('resets data slices but preserves connection and UI state', () => {
    const store = useDebugStore.getState();

    // Populate data + connection + ui
    store.processEvent(positionUpdate(5));
    store.processEvent(intentEvent(9));
    store.processEvent(streamStart());
    store.processEvent(streamEnd({ tokensUsed: { prompt: 10, completion: 5 }, cost: 0.01 }));
    store.setConnectionUrl('ws://localhost:9222');
    store.setSessionId('session-abc');
    store.setConnectionStatus('connected');
    store.focusPanel('llm');

    store.processEvent(sessionStart());

    const state = useDebugStore.getState();
    expect(state.chess.moveNumber).toBe(0);
    expect(state.annotations).toEqual([]);
    expect(state.llm.totals.streams).toBe(0);
    expect(state.session.active).toBe(true);

    // Connection and UI survive
    expect(state.connection.url).toBe('ws://localhost:9222');
    expect(state.connection.sessionId).toBe('session-abc');
    expect(state.connection.status).toBe('connected');
    expect(state.ui.focusedPanel).toBe('llm');
  });

  it('preserves the user-chosen board perspective across sessions', () => {
    const store = useDebugStore.getState();
    store.flipBoard();
    expect(useDebugStore.getState().chess.perspective).toBe('black');

    store.processEvent(sessionStart());
    expect(useDebugStore.getState().chess.perspective).toBe('black');
  });
});

describe('annotation slice', () => {
  it('adds intents as pending and transitions them to done on comment events', () => {
    const store = useDebugStore.getState();
    store.processEvent(intentEvent(9, { intentType: 'blunder_explanation', mandatory: true }));
    store.processEvent(commentEvent(9, { comment: 'A serious mistake.' }));

    const [item] = useDebugStore.getState().annotations;
    expect(item?.status).toBe('done');
    expect(item?.comment).toBe('A serious mistake.');
    expect(item?.mandatory).toBe(true);
  });

  it('marks intents as filtered with the filter reason', () => {
    const store = useDebugStore.getState();
    store.processEvent(intentEvent(4));
    store.processEvent(commentEvent(4, { comment: '', filtered: 'density' }));

    const [item] = useDebugStore.getState().annotations;
    expect(item?.status).toBe('filtered');
    expect(item?.filtered).toBe('density');
  });

  it('keys intents by plyIndex, keeping the highest-priority descriptor', () => {
    const store = useDebugStore.getState();
    store.processEvent(intentEvent(7, { intentType: 'why_this_move', priority: 1 }));
    store.processEvent(intentEvent(7, { intentType: 'tactical_shot', priority: 5 }));
    store.processEvent(intentEvent(7, { intentType: 'human_move', priority: 2 }));

    const annotations = useDebugStore.getState().annotations;
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.intentType).toBe('tactical_shot');
    expect(annotations[0]?.priority).toBe(5);
  });

  it('caps the annotation queue at the configured bound', () => {
    const store = useDebugStore.getState();
    for (let ply = 1; ply <= MAX_ANNOTATIONS + 20; ply++) {
      store.processEvent(intentEvent(ply));
    }

    const annotations = useDebugStore.getState().annotations;
    expect(annotations).toHaveLength(MAX_ANNOTATIONS);
    expect(annotations[0]?.plyIndex).toBe(21); // oldest 20 dropped
  });

  it('appends a standalone item for comments without a matching intent', () => {
    const store = useDebugStore.getState();
    store.processEvent(commentEvent(33, { comment: 'Orphan comment.', moveNotation: '17. Rd1' }));

    const [item] = useDebugStore.getState().annotations;
    expect(item?.plyIndex).toBe(33);
    expect(item?.status).toBe('done');
    expect(item?.moveNotation).toBe('17. Rd1');
  });
});

describe('pause buffering and replay', () => {
  it('buffers events while paused and replays them on resume', () => {
    const store = useDebugStore.getState();
    store.togglePause();

    store.processEvent(positionUpdate(7));
    store.processEvent(intentEvent(3));
    expect(useDebugStore.getState().chess.moveNumber).toBe(0);
    expect(useDebugStore.getState().annotations).toHaveLength(0);

    store.togglePause(); // resume → replay
    expect(useDebugStore.getState().chess.moveNumber).toBe(7);
    expect(useDebugStore.getState().annotations).toHaveLength(1);
  });

  it('bounds the pause buffer as a ring, dropping the oldest events', () => {
    const store = useDebugStore.getState();
    store.togglePause();

    // One-char chunks; only the last MAX_PAUSED_EVENTS survive the ring
    const total = MAX_PAUSED_EVENTS + 10;
    for (let i = 0; i < total; i++) {
      store.processEvent(chunk('thinking', String(i % 10)));
    }

    store.togglePause();
    vi.advanceTimersByTime(LLM_CHUNK_FLUSH_MS + 10);

    const reasoning = useDebugStore.getState().llm.reasoning;
    expect(reasoning.length).toBe(MAX_PAUSED_EVENTS);
    // First surviving chunk is event #10 → digit '0'
    expect(reasoning[0]).toBe(String(10 % 10));
    expect(reasoning[reasoning.length - 1]).toBe(String((total - 1) % 10));
  });
});

describe('UI actions', () => {
  it('cycles panel focus forward with wraparound', () => {
    const store = useDebugStore.getState();
    expect(useDebugStore.getState().ui.focusedPanel).toBe('board');
    store.focusNextPanel();
    expect(useDebugStore.getState().ui.focusedPanel).toBe('llm');
    store.focusNextPanel();
    expect(useDebugStore.getState().ui.focusedPanel).toBe('annotations');
    store.focusNextPanel();
    expect(useDebugStore.getState().ui.focusedPanel).toBe('engine');
    store.focusNextPanel();
    expect(useDebugStore.getState().ui.focusedPanel).toBe('board');
  });

  it('cycles panel focus backward with wraparound', () => {
    const store = useDebugStore.getState();
    store.focusPrevPanel();
    expect(useDebugStore.getState().ui.focusedPanel).toBe('engine');
  });

  it('flips the board perspective', () => {
    const store = useDebugStore.getState();
    expect(useDebugStore.getState().chess.perspective).toBe('white');
    store.flipBoard();
    expect(useDebugStore.getState().chess.perspective).toBe('black');
    store.flipBoard();
    expect(useDebugStore.getState().chess.perspective).toBe('white');
  });

  it('clamps LLM scroll offset at zero (following)', () => {
    const store = useDebugStore.getState();
    store.scrollLLM(10);
    expect(useDebugStore.getState().llm.scrollOffset).toBe(10);
    store.scrollLLM(-100);
    expect(useDebugStore.getState().llm.scrollOffset).toBe(0);
    store.scrollLLM(5);
    store.followLLM();
    expect(useDebugStore.getState().llm.scrollOffset).toBe(0);
  });
});
