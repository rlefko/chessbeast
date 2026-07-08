/**
 * Tests for Narrator parallelization
 */

import { describe, it, expect, vi } from 'vitest';

import type { OpenAIClient } from '../client/openai-client.js';
import { CircuitOpenError, RateLimitError } from '../errors.js';
import type { CommentIntent, CommentIntentType } from '../narration/intents.js';
import { createNarrator } from '../narration/narrator.js';
import type { IdeaKey } from '../themes/idea-keys.js';

// Helper to create a mock OpenAI client
function createMockClient(
  delayMs: number = 100,
): { chat: ReturnType<typeof vi.fn> } & Partial<OpenAIClient> {
  return {
    chat: vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        content: 'Test comment for the chess move.',
        usage: { totalTokens: 50 },
      };
    }),
  };
}

// Helper to create a test idea key
function createTestIdeaKey(id: number): IdeaKey {
  return {
    key: `test-idea-${id}`,
    type: 'tactic',
    concept: 'test',
    instance: `instance-${id}`,
  };
}

// Helper to create test intents with all required fields
// Mark as mandatory and high priority to bypass density/redundancy filters
function createTestIntents(count: number): CommentIntent[] {
  return Array.from({ length: count }, (_, i) => ({
    plyIndex: i * 3, // Space them out to avoid density filtering
    type: 'blunder_explanation' as CommentIntentType, // High priority type
    priority: 100, // Max priority
    suggestedLength: 'standard' as const,
    mandatory: true, // Bypass density filtering
    scoreBreakdown: {
      criticality: 1,
      themeNovelty: 0,
      instructionalValue: 0.5,
      redundancyPenalty: 0,
      totalScore: 1,
    },
    content: {
      move: 'e4',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moveNumber: Math.floor(i / 2) + 1,
      isWhiteMove: i % 2 === 0,
      ideaKeys: [createTestIdeaKey(i)], // Unique idea keys to avoid redundancy
    },
  }));
}

interface NarratorIntentOptions {
  type?: CommentIntentType;
  priority?: number;
  mandatory?: boolean;
  ideaId?: number;
}

// Helper to create a single intent at a specific ply with overrides
function createIntentAt(plyIndex: number, options: NarratorIntentOptions = {}): CommentIntent {
  const priority = options.priority ?? 1;
  return {
    plyIndex,
    type: options.type ?? 'blunder_explanation',
    priority,
    suggestedLength: 'standard' as const,
    mandatory: options.mandatory ?? true,
    scoreBreakdown: {
      criticality: priority,
      themeNovelty: 0,
      instructionalValue: 0.5,
      redundancyPenalty: 0,
      totalScore: priority,
    },
    content: {
      move: 'e4',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moveNumber: Math.floor(plyIndex / 2) + 1,
      isWhiteMove: plyIndex % 2 === 0,
      ideaKeys: [createTestIdeaKey(options.ideaId ?? plyIndex)],
    },
  };
}

interface CapturedRequest {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
}

interface CapturingClient {
  chat: ReturnType<typeof vi.fn>;
  requests: CapturedRequest[];
}

// Helper to create a mock client that records every request it receives
function createCapturingClient(response: string = 'A solid developing move.'): CapturingClient {
  const requests: CapturedRequest[] = [];
  return {
    requests,
    chat: vi.fn().mockImplementation(async (request: CapturedRequest) => {
      requests.push(request);
      return { content: response, usage: { totalTokens: 10 } };
    }),
  };
}

describe('Narrator', () => {
  describe('parallelization', () => {
    it('should generate comments in parallel', async () => {
      const mockClient = createMockClient(100);
      const narrator = createNarrator(mockClient as unknown as OpenAIClient, {
        concurrency: 5,
        densityLevel: 'verbose',
      });

      const intents = createTestIntents(10);

      const startTime = Date.now();
      await narrator.narrate({ intents, totalPlies: 100 }); // Large game to avoid ratio limits
      const elapsed = Date.now() - startTime;

      // With 10 intents, 100ms each, concurrency 5:
      // Sequential: 1000ms, Parallel: ~200-300ms
      expect(elapsed).toBeLessThan(500);
      expect(mockClient.chat).toHaveBeenCalledTimes(10);
    });

    it('should respect concurrency limit', async () => {
      let concurrentCount = 0;
      let maxConcurrent = 0;

      const mockClient = {
        chat: vi.fn().mockImplementation(async () => {
          concurrentCount++;
          maxConcurrent = Math.max(maxConcurrent, concurrentCount);
          await new Promise((resolve) => setTimeout(resolve, 50));
          concurrentCount--;
          return { content: 'Test', usage: { totalTokens: 50 } };
        }),
      };

      const narrator = createNarrator(mockClient as unknown as OpenAIClient, {
        concurrency: 3,
        densityLevel: 'verbose',
      });

      const intents = createTestIntents(10);
      await narrator.narrate({ intents, totalPlies: 100 });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should use fallback on error without blocking others', async () => {
      let callCount = 0;
      const mockClient = {
        chat: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 3) {
            throw new Error('API error');
          }
          return { content: 'Test comment.', usage: { totalTokens: 50 } };
        }),
      };

      const narrator = createNarrator(mockClient as unknown as OpenAIClient, {
        concurrency: 5,
        densityLevel: 'verbose',
      });

      const intents = createTestIntents(5);
      const warnings: string[] = [];

      const result = await narrator.narrate({ intents, totalPlies: 100 }, undefined, (w) => {
        warnings.push(w);
      });

      // All should have comments (4 LLM + 1 fallback)
      expect(result.comments.size).toBe(5);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Failed to generate comment');
    });

    it('should track progress correctly', async () => {
      const mockClient = createMockClient(50);
      const narrator = createNarrator(mockClient as unknown as OpenAIClient, {
        concurrency: 2,
        densityLevel: 'verbose',
      });

      const intents = createTestIntents(4);
      const progressCalls: Array<{ current: number; total: number }> = [];

      await narrator.narrate({ intents, totalPlies: 100 }, (progress) => {
        progressCalls.push({ current: progress.current, total: progress.total });
      });

      expect(progressCalls).toHaveLength(4);
      // All should report total correctly
      expect(progressCalls.every((p) => p.total === 4)).toBe(true);
      // Current should be 1-4 (may be out of order due to parallelism)
      const currents = progressCalls.map((p) => p.current).sort((a, b) => a - b);
      expect(currents).toEqual([1, 2, 3, 4]);
    });

    it('should work with concurrency of 1 (sequential)', async () => {
      let concurrentCount = 0;
      let maxConcurrent = 0;

      const mockClient = {
        chat: vi.fn().mockImplementation(async () => {
          concurrentCount++;
          maxConcurrent = Math.max(maxConcurrent, concurrentCount);
          await new Promise((resolve) => setTimeout(resolve, 10));
          concurrentCount--;
          return { content: 'Test', usage: { totalTokens: 50 } };
        }),
      };

      const narrator = createNarrator(mockClient as unknown as OpenAIClient, {
        concurrency: 1,
        densityLevel: 'verbose',
      });

      const intents = createTestIntents(5);
      await narrator.narrate({ intents, totalPlies: 100 });

      // Should never exceed 1 concurrent
      expect(maxConcurrent).toBe(1);
    });

    it('should aggregate token usage correctly', async () => {
      const mockClient = {
        chat: vi.fn().mockImplementation(async () => {
          return { content: 'Test comment.', usage: { totalTokens: 100 } };
        }),
      };

      const narrator = createNarrator(mockClient as unknown as OpenAIClient, {
        concurrency: 5,
        densityLevel: 'verbose',
      });

      const intents = createTestIntents(5);
      const result = await narrator.narrate({ intents, totalPlies: 100 });

      // 5 calls x 100 tokens each = 500 total
      expect(result.stats.totalTokensUsed).toBe(500);
      expect(result.stats.commentsGenerated).toBe(5);
    });
  });

  describe('fallback behavior', () => {
    it('should use fallback when no client provided', async () => {
      const narrator = createNarrator(undefined, {
        densityLevel: 'verbose',
      });

      const intents = createTestIntents(3);
      const result = await narrator.narrate({ intents, totalPlies: 100 });

      expect(result.comments.size).toBe(3);
      expect(result.stats.totalTokensUsed).toBe(0);
    });
  });

  describe('error resilience', () => {
    it('resolves with fallback comments when the circuit breaker is open', async () => {
      const mockClient = {
        chat: vi.fn().mockRejectedValue(new CircuitOpenError(new Date(), 1000)),
      };
      const narrator = createNarrator(mockClient as unknown as OpenAIClient, {
        densityLevel: 'verbose',
      });

      const result = await narrator.narrate({ intents: createTestIntents(3), totalPlies: 100 });

      expect(result.comments.size).toBe(3);
      for (const narration of result.comments.values()) {
        expect(narration.comment.trim().length).toBeGreaterThan(0);
      }
      // Documents current behavior; arguably a bug: narrate() has a dedicated
      // 'LLM circuit breaker open, using fallback comments' warning branch,
      // but generateComment catches all client errors first and emits the
      // generic 'Failed to generate comment' warning, so the specific branch
      // is unreachable for chat failures.
      expect(result.warnings).toHaveLength(3);
      expect(result.warnings.every((w) => w.startsWith('Failed to generate comment'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('Circuit breaker is open'))).toBe(true);
      expect(result.warnings).not.toContain('LLM circuit breaker open, using fallback comments');
    });

    it('resolves with fallback comments when rate limited', async () => {
      const mockClient = {
        chat: vi.fn().mockRejectedValue(new RateLimitError(500)),
      };
      const narrator = createNarrator(mockClient as unknown as OpenAIClient, {
        densityLevel: 'verbose',
      });

      const result = await narrator.narrate({ intents: createTestIntents(2), totalPlies: 100 });

      expect(result.comments.size).toBe(2);
      for (const narration of result.comments.values()) {
        expect(narration.comment.trim().length).toBeGreaterThan(0);
      }
      // Same generic-warning behavior as the circuit-open case; the specific
      // 'Rate limit reached, using fallback comments' branch is unreachable.
      expect(result.warnings.some((w) => w.includes('Rate limited, retry after 500ms'))).toBe(true);
      expect(result.warnings).not.toContain('Rate limit reached, using fallback comments');
    });

    it('never rejects even when every LLM call fails', async () => {
      const mockClient = {
        chat: vi.fn().mockRejectedValue(new Error('boom')),
      };
      const narrator = createNarrator(mockClient as unknown as OpenAIClient, {
        densityLevel: 'verbose',
      });

      const result = await narrator.narrate({ intents: createTestIntents(4), totalPlies: 100 });

      expect(result.comments.size).toBe(4);
      expect(result.warnings.every((w) => w.includes('boom'))).toBe(true);
    });
  });

  describe('fallback comments', () => {
    const ALL_INTENT_TYPES: CommentIntentType[] = [
      'why_this_move',
      'what_was_missed',
      'tactical_shot',
      'strategic_plan',
      'endgame_technique',
      'human_move',
      'theme_emergence',
      'theme_resolution',
      'critical_moment',
      'blunder_explanation',
    ];

    it('produces a non-empty comment within the word limit for every intent type', async () => {
      const intents = ALL_INTENT_TYPES.map((type, i) => createIntentAt(i * 5, { type }));
      const narrator = createNarrator(undefined, { densityLevel: 'verbose' });

      const result = await narrator.narrate({ intents, totalPlies: 200 });

      expect(result.comments.size).toBe(ALL_INTENT_TYPES.length);
      for (const narration of result.comments.values()) {
        expect(narration.comment.trim().length).toBeGreaterThan(0);
        const wordCount = narration.comment.split(/\s+/).filter(Boolean).length;
        expect(wordCount).toBeLessThanOrEqual(50);
      }
    });

    it('names the better alternative in blunder fallbacks', async () => {
      const intent = createIntentAt(4, { type: 'blunder_explanation' });
      intent.content.bestAlternative = 'Qd5';
      intent.content.winProbDelta = -25;
      const narrator = createNarrator(undefined, { densityLevel: 'verbose' });

      const result = await narrator.narrate({ intents: [intent], totalPlies: 100 });

      const comment = result.comments.get(4)?.comment ?? '';
      expect(comment).toContain('Qd5');
      expect(comment).toContain('mistake');
    });
  });

  describe('word limits', () => {
    it('passes over-long LLM output through unmodified', async () => {
      // Documents current behavior; arguably a bug: maxWordsPerComment is only
      // a prompt-level hint. cleanComment() normalizes whitespace and
      // punctuation but never truncates, so a 120-word response survives a
      // 50-word limit intact.
      const longText = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
      const client = createCapturingClient(longText);
      const narrator = createNarrator(client as unknown as OpenAIClient, {
        densityLevel: 'verbose',
        maxWordsPerComment: 50,
      });

      const result = await narrator.narrate({ intents: [createIntentAt(0)], totalPlies: 100 });

      const comment = result.comments.get(0)?.comment ?? '';
      expect(comment.split(/\s+/)).toHaveLength(120);
    });

    it('normalizes quotes, whitespace, and trailing punctuation', async () => {
      const client = createCapturingClient('  "A strong    outpost on e5"  ');
      const narrator = createNarrator(client as unknown as OpenAIClient, {
        densityLevel: 'verbose',
      });

      const result = await narrator.narrate({ intents: [createIntentAt(0)], totalPlies: 100 });

      expect(result.comments.get(0)?.comment).toBe('A strong outpost on e5.');
    });
  });

  describe('same-ply dedupe', () => {
    it('keeps the mandatory intent when it shares a ply with a higher-priority optional one', async () => {
      const mandatory = createIntentAt(6, {
        type: 'blunder_explanation',
        mandatory: true,
        priority: 0.4,
        ideaId: 1,
      });
      const optional = createIntentAt(6, {
        type: 'strategic_plan',
        mandatory: false,
        priority: 0.9,
        ideaId: 2,
      });
      const client = createCapturingClient();
      const narrator = createNarrator(client as unknown as OpenAIClient, {
        densityLevel: 'verbose',
      });

      const result = await narrator.narrate({
        intents: [optional, mandatory],
        totalPlies: 100,
      });

      expect(client.chat).toHaveBeenCalledTimes(1);
      expect(result.comments.size).toBe(1);
      expect(result.comments.get(6)?.intentType).toBe('blunder_explanation');
    });

    it('keeps the highest-priority intent among optional intents on the same ply', async () => {
      const high = createIntentAt(8, {
        type: 'tactical_shot',
        mandatory: false,
        priority: 0.9,
        ideaId: 3,
      });
      const low = createIntentAt(8, {
        type: 'strategic_plan',
        mandatory: false,
        priority: 0.5,
        ideaId: 4,
      });
      const client = createCapturingClient();
      const narrator = createNarrator(client as unknown as OpenAIClient, {
        densityLevel: 'verbose',
      });

      const result = await narrator.narrate({ intents: [low, high], totalPlies: 100 });

      expect(client.chat).toHaveBeenCalledTimes(1);
      expect(result.comments.size).toBe(1);
      expect(result.comments.get(8)?.intentType).toBe('tactical_shot');
      expect(result.stats.totalIntents).toBe(2);
      expect(result.stats.commentsGenerated).toBe(1);
    });
  });

  describe('perspective', () => {
    it('sends the white perspective in the system prompt', async () => {
      const client = createCapturingClient();
      const narrator = createNarrator(client as unknown as OpenAIClient, {
        densityLevel: 'verbose',
        perspective: 'white',
      });

      await narrator.narrate({ intents: [createIntentAt(0)], totalPlies: 100 });

      const system = client.requests[0]?.messages[0];
      expect(system?.role).toBe('system');
      expect(system?.content).toContain("from White's point of view");
      expect(system?.content).toContain('White is "we/our"');
    });

    it('sends the black perspective in the system prompt', async () => {
      const client = createCapturingClient();
      const narrator = createNarrator(client as unknown as OpenAIClient, {
        densityLevel: 'verbose',
        perspective: 'black',
      });

      await narrator.narrate({ intents: [createIntentAt(0)], totalPlies: 100 });

      const system = client.requests[0]?.messages[0];
      expect(system?.content).toContain('Black is "we/our"');
    });

    it('defaults to a neutral, third-person system prompt', async () => {
      const client = createCapturingClient();
      const narrator = createNarrator(client as unknown as OpenAIClient, {
        densityLevel: 'verbose',
      });

      await narrator.narrate({ intents: [createIntentAt(0)], totalPlies: 100 });

      const system = client.requests[0]?.messages[0];
      expect(system?.content).toContain('objective third person');
      expect(system?.content).not.toContain('we/our');
    });
  });
});
