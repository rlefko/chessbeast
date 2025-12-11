/**
 * Tests for Narrator parallelization
 */

import { describe, it, expect, vi } from 'vitest';

import type { OpenAIClient } from '../client/openai-client.js';
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

      const result = await narrator.narrate(
        { intents, totalPlies: 100 },
        undefined,
        (w) => {
          warnings.push(w);
        },
      );

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
});
