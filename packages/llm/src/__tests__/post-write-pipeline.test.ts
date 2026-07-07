/**
 * Tests for the Post-Write Annotation Pipeline
 *
 * Runs the pipeline fully offline: constructed with `useLlm: false` and no
 * client, so the narrator falls back to deterministic template comments.
 * No network, no timers, no OPENAI_API_KEY.
 */

import { describe, expect, it, vi } from 'vitest';

import type {
  PostWritePipelineConfig,
  PostWritePipelineProgress,
  PostWritePipelineResult,
} from '../annotation/post-write-pipeline.js';
import { createPostWritePipeline } from '../annotation/post-write-pipeline.js';
import type { OpenAIClient } from '../client/openai-client.js';
import type { CommentIntent, CommentIntentType, IntentInput } from '../narration/intents.js';
import { createCommentIntent } from '../narration/intents.js';
import type { IdeaKey } from '../themes/idea-keys.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Create a unique idea key so intents do not trip the redundancy filter. */
function makeIdeaKey(id: string): IdeaKey {
  return {
    key: `idea-${id}`,
    type: 'plan',
    concept: `concept-${id}`,
    instance: id,
  };
}

/** Overridable fields for the local CommentIntent factory. */
interface IntentOverrides {
  type?: CommentIntentType;
  plyIndex?: number;
  priority?: number;
  mandatory?: boolean;
  isWhiteMove?: boolean;
  move?: string;
  bestAlternative?: string;
  winProbDelta?: number;
  ideaKeys?: IdeaKey[];
}

/**
 * Local CommentIntent factory. Defaults to a mandatory intent with a unique
 * idea key so it passes density and redundancy filtering unless a test
 * explicitly opts into filtering behavior.
 */
function makeIntent(overrides: IntentOverrides = {}): CommentIntent {
  const plyIndex = overrides.plyIndex ?? 0;
  const priority = overrides.priority ?? 0.5;

  const intent: CommentIntent = {
    type: overrides.type ?? 'strategic_plan',
    plyIndex,
    priority,
    mandatory: overrides.mandatory ?? true,
    suggestedLength: 'standard',
    scoreBreakdown: {
      criticality: 0.5,
      themeNovelty: 0,
      instructionalValue: 0.5,
      redundancyPenalty: 0,
      totalScore: priority,
    },
    content: {
      move: overrides.move ?? 'e4',
      fen: START_FEN,
      moveNumber: Math.floor(plyIndex / 2) + 1,
      isWhiteMove: overrides.isWhiteMove ?? plyIndex % 2 === 0,
      ideaKeys: overrides.ideaKeys ?? [makeIdeaKey(`ply-${plyIndex}`)],
    },
  };

  if (overrides.bestAlternative !== undefined) {
    intent.content.bestAlternative = overrides.bestAlternative;
  }
  if (overrides.winProbDelta !== undefined) {
    intent.content.winProbDelta = overrides.winProbDelta;
  }

  return intent;
}

/** Run the pipeline fully offline (no client, useLlm: false). */
async function runOffline(
  intents: CommentIntent[],
  totalPlies: number,
  config: Partial<PostWritePipelineConfig> = {},
): Promise<PostWritePipelineResult> {
  const pipeline = createPostWritePipeline(undefined, { useLlm: false, ...config });
  return pipeline.annotate({ intents, totalPlies });
}

/** Sorted numeric keys of a Map for stable assertions. */
function sortedKeys(map: Map<number, unknown>): number[] {
  return [...map.keys()].sort((a, b) => a - b);
}

/** A client whose chat call always rejects, to exercise warning paths offline. */
function createFailingClient(): OpenAIClient {
  return {
    chat: vi.fn().mockRejectedValue(new Error('offline test failure')),
  } as unknown as OpenAIClient;
}

describe('PostWritePipeline', () => {
  describe('NAG assignment per intent type', () => {
    it('assigns $4 (blunder) on the ply of a blunder_explanation intent', async () => {
      const result = await runOffline(
        [makeIntent({ type: 'blunder_explanation', plyIndex: 8 })],
        60,
      );

      expect(result.nags.get(8)).toEqual(['$4']);
      expect(result.comments.get(8)).toBeTruthy();
    });

    it('keeps $4 for a Black blunder: the NAG value does not flip with side', async () => {
      // NAG $4 ("very poor move") is side-agnostic in PGN; a blunder played
      // by Black must produce the same glyph as one played by White.
      const result = await runOffline(
        [
          makeIntent({
            type: 'blunder_explanation',
            plyIndex: 9,
            isWhiteMove: false,
            move: 'Qh4',
            winProbDelta: 42,
          }),
        ],
        60,
      );

      expect(result.nags.get(9)).toEqual(['$4']);
    });

    it('assigns $2 (mistake) to what_was_missed when |winProbDelta| >= 15', async () => {
      const result = await runOffline(
        [
          makeIntent({
            type: 'what_was_missed',
            plyIndex: 10,
            winProbDelta: -20,
            bestAlternative: 'Nf3',
          }),
        ],
        60,
      );

      expect(result.nags.get(10)).toEqual(['$2']);
    });

    it('assigns $2 at the exact |winProbDelta| === 15 boundary (threshold is inclusive)', async () => {
      const result = await runOffline(
        [makeIntent({ type: 'what_was_missed', plyIndex: 10, winProbDelta: 15 })],
        60,
      );

      expect(result.nags.get(10)).toEqual(['$2']);
    });

    it('assigns $6 (inaccuracy) to what_was_missed when |winProbDelta| < 15', async () => {
      const result = await runOffline(
        [makeIntent({ type: 'what_was_missed', plyIndex: 10, winProbDelta: -8 })],
        60,
      );

      expect(result.nags.get(10)).toEqual(['$6']);
    });

    it('assigns no NAG to what_was_missed when winProbDelta is absent', async () => {
      const result = await runOffline([makeIntent({ type: 'what_was_missed', plyIndex: 10 })], 60);

      expect(result.comments.has(10)).toBe(true);
      expect(result.nags.has(10)).toBe(false);
    });

    it('assigns $1 (good move) to tactical_shot and why_this_move intents', async () => {
      const result = await runOffline(
        [
          makeIntent({ type: 'tactical_shot', plyIndex: 6 }),
          makeIntent({ type: 'why_this_move', plyIndex: 20 }),
        ],
        80,
      );

      expect(result.nags.get(6)).toEqual(['$1']);
      expect(result.nags.get(20)).toEqual(['$1']);
    });

    it('assigns no NAG for critical_moment intents while still emitting a comment', async () => {
      const result = await runOffline([makeIntent({ type: 'critical_moment', plyIndex: 14 })], 60);

      expect(result.comments.has(14)).toBe(true);
      expect(result.nags.has(14)).toBe(false);
    });

    it('maps a blunder intent built with the real createCommentIntent helper to $4', async () => {
      const input: IntentInput = {
        move: 'Qxb7',
        fen: START_FEN,
        moveNumber: 10,
        isWhiteMove: true,
        plyIndex: 18,
        criticalityScore: {
          score: 90,
          factors: {
            winProbDelta: 40,
            cpDelta: 400,
            tacticalVolatility: 0.5,
            themeNovelty: 0,
            kingSafetyRisk: 0.2,
            repetitionPenalty: 0,
          },
          recommendedTier: 'full',
          reason: 'large eval swing',
        },
        themeDeltas: [],
        activeThemes: [],
        bestMove: 'Nf3',
        evalBefore: 50,
        evalAfter: -350,
        explainedIdeaKeys: new Set<string>(),
      };

      const intent = createCommentIntent(input);
      expect(intent).not.toBeNull();
      expect(intent?.type).toBe('blunder_explanation');
      expect(intent?.mandatory).toBe(true);

      const result = await runOffline([intent!], 60);
      expect(result.nags.get(18)).toEqual(['$4']);
      // Template fallback references the better alternative
      expect(result.comments.get(18)).toContain('Nf3');
    });
  });

  describe('maxCommentsPerGame cap', () => {
    it('keeps all mandatory intents and cuts optional intents by priority when over the cap', async () => {
      const intents = [
        makeIntent({ plyIndex: 4, mandatory: true, priority: 0.25 }),
        makeIntent({ plyIndex: 12, mandatory: false, priority: 0.9 }),
        makeIntent({ plyIndex: 20, mandatory: false, priority: 0.5 }),
        makeIntent({ plyIndex: 28, mandatory: false, priority: 0.7 }),
        makeIntent({ plyIndex: 36, mandatory: false, priority: 0.2 }),
        makeIntent({ plyIndex: 44, mandatory: true, priority: 0.25 }),
      ];

      const result = await runOffline(intents, 200, { maxCommentsPerGame: 3 });

      expect(result.stats.totalIntents).toBe(6);
      expect(result.stats.intentsAfterDensity).toBe(6);
      expect(result.stats.intentsAfterRedundancy).toBe(3);
      // Both mandatory intents survive; the single optional slot goes to the
      // highest-priority optional intent (ply 12, priority 0.9).
      expect(sortedKeys(result.comments)).toEqual([4, 12, 44]);
      expect(result.stats.commentsGenerated).toBe(result.comments.size);
    });

    it('keeps every mandatory intent even when the mandatory count alone exceeds the cap', async () => {
      // documents current behavior: mandatory intents are never cut, so the
      // effective comment count can exceed maxCommentsPerGame.
      const intents = [4, 12, 20, 28].map((ply) =>
        makeIntent({ plyIndex: ply, mandatory: true, priority: 0.3 }),
      );
      intents.push(makeIntent({ plyIndex: 36, mandatory: false, priority: 0.95 }));

      const result = await runOffline(intents, 200, { maxCommentsPerGame: 2 });

      expect(result.stats.intentsAfterRedundancy).toBe(4);
      expect(sortedKeys(result.comments)).toEqual([4, 12, 20, 28]);
    });
  });

  describe('result shape', () => {
    it('returns empty maps and zeroed stats for empty intent input without throwing', async () => {
      const result = await runOffline([], 40);

      expect(result.comments.size).toBe(0);
      expect(result.nags.size).toBe(0);
      expect(result.warnings).toEqual([]);
      expect(result.stats).toEqual({
        totalIntents: 0,
        intentsAfterDensity: 0,
        intentsAfterRedundancy: 0,
        commentsGenerated: 0,
        tokensUsed: 0,
        averageCommentLength: 0,
      });
    });

    it('keys comments and nags by plyIndex and only stores NAG entries for NAG-bearing intents', async () => {
      const intents = [
        makeIntent({ type: 'blunder_explanation', plyIndex: 3 }),
        makeIntent({ type: 'why_this_move', plyIndex: 9 }),
        makeIntent({ type: 'critical_moment', plyIndex: 15 }),
      ];

      const result = await runOffline(intents, 80);

      expect(sortedKeys(result.comments)).toEqual([3, 9, 15]);
      for (const comment of result.comments.values()) {
        expect(comment.length).toBeGreaterThan(0);
      }
      // critical_moment produces no NAG entry at all
      expect(sortedKeys(result.nags)).toEqual([3, 9]);
      expect(result.lineMemory).toBeDefined();
      expect(result.stats.commentsGenerated).toBe(result.comments.size);
    });

    it('emits progress phases in order filtering → narrating → complete with a consistent final count', async () => {
      const phases: PostWritePipelineProgress['phase'][] = [];
      let finalProgress: PostWritePipelineProgress | undefined;

      const pipeline = createPostWritePipeline(undefined, { useLlm: false });
      const result = await pipeline.annotate(
        { intents: [makeIntent({ plyIndex: 4 }), makeIntent({ plyIndex: 12 })], totalPlies: 80 },
        (progress) => {
          phases.push(progress.phase);
          finalProgress = progress;
        },
      );

      expect(phases[0]).toBe('filtering');
      expect(phases[phases.length - 1]).toBe('complete');
      expect(phases.indexOf('narrating')).toBeGreaterThan(phases.lastIndexOf('filtering'));
      expect(finalProgress?.commentsGenerated).toBe(result.comments.size);
    });
  });

  describe('warnings propagation', () => {
    it('routes warnings to the onWarning callback when provided, leaving result.warnings empty', async () => {
      const pipeline = createPostWritePipeline(createFailingClient(), { useLlm: true });
      const warnings: string[] = [];

      const result = await pipeline.annotate(
        { intents: [makeIntent({ type: 'blunder_explanation', plyIndex: 8 })], totalPlies: 60 },
        undefined,
        (warning) => {
          warnings.push(warning);
        },
      );

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Failed to generate comment');
      expect(result.warnings).toEqual([]);
      // The failed LLM call still yields a fallback comment
      expect(result.comments.size).toBe(1);
    });

    it('returns warnings in result.warnings when no onWarning callback is given', async () => {
      const pipeline = createPostWritePipeline(createFailingClient(), { useLlm: true });

      const result = await pipeline.annotate({
        intents: [makeIntent({ type: 'blunder_explanation', plyIndex: 8 })],
        totalPlies: 60,
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Failed to generate comment');
      expect(result.comments.size).toBe(1);
    });

    it('never calls the client when useLlm is false, falling back to template comments', async () => {
      const chat = vi.fn();
      const client = { chat } as unknown as OpenAIClient;

      const pipeline = createPostWritePipeline(client, { useLlm: false });
      const result = await pipeline.annotate({
        intents: [makeIntent({ type: 'blunder_explanation', plyIndex: 8, bestAlternative: 'Nf3' })],
        totalPlies: 60,
      });

      expect(chat).not.toHaveBeenCalled();
      expect(result.stats.tokensUsed).toBe(0);
      expect(result.warnings).toEqual([]);
      expect(result.comments.get(8)).toContain('Nf3');
    });
  });

  describe('density and redundancy integration', () => {
    it('thins a dense cluster of same-idea intents on adjacent plies down to a single comment', async () => {
      const sharedIdea = makeIdeaKey('greek-gift');
      const intents = [10, 11, 12, 13, 14].map((ply) =>
        makeIntent({ plyIndex: ply, mandatory: false, priority: 0.5, ideaKeys: [sharedIdea] }),
      );

      const result = await runOffline(intents, 60);

      expect(result.stats.totalIntents).toBe(5);
      // The 'normal' density config forbids consecutive comments, dropping
      // plies 11 and 13 in the pipeline's density pass.
      expect(result.stats.intentsAfterDensity).toBe(3);
      // The shared idea key then makes plies 12 and 14 redundant inside the
      // narrator, so only the first mention survives.
      expect(sortedKeys(result.comments)).toEqual([10]);
      expect(result.stats.commentsGenerated).toBe(1);
      // documents current behavior; arguably a bug: stats.intentsAfterRedundancy
      // reflects the maxCommentsPerGame cap applied in the pipeline, NOT the
      // redundancy filter (which runs inside the narrator), so it stays at 3
      // even though only 1 comment was ultimately generated.
      expect(result.stats.intentsAfterRedundancy).toBe(3);
    });

    // pins the PR-#99/#101 class of annotation-placement/quality regressions:
    // which intent wins a density conflict must be deterministic.
    it('resolves density conflicts between adjacent optional intents by input order, not priority', async () => {
      // documents current behavior; arguably a bug: the pipeline passes intents
      // to DensityFilter.filter in INPUT order even though the filter's contract
      // says they "should be sorted by priority". An earlier low-priority intent
      // therefore crowds out a later, higher-priority adjacent one.
      const lowPriorityFirst = makeIntent({ plyIndex: 10, mandatory: false, priority: 0.3 });
      const highPrioritySecond = makeIntent({ plyIndex: 11, mandatory: false, priority: 0.65 });

      const result = await runOffline([lowPriorityFirst, highPrioritySecond], 60);

      expect(result.stats.intentsAfterDensity).toBe(1);
      expect(sortedKeys(result.comments)).toEqual([10]);
    });
  });
});
