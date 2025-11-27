/**
 * Mock LLM/Annotator client for testing
 */

import type { GameAnalysis } from '@chessbeast/core';
import { vi } from 'vitest';

/**
 * Annotation result from the LLM annotator
 */
export interface AnnotationResult {
  analysis: GameAnalysis;
  tokenUsage: { used: number; remaining: number };
  positionsAnnotated: number;
  summaryGenerated: boolean;
}

export interface MockLlmConfig {
  /** Predefined annotations for specific move SANs */
  annotations?: Map<string, string>;
  /** Default annotation template */
  defaultAnnotation?: string;
  /** Summary template */
  summaryTemplate?: string;
  /** Whether the service should report as healthy */
  healthy?: boolean;
  /** Simulate latency in milliseconds */
  latencyMs?: number;
  /** Simulate failures */
  shouldFail?: boolean;
  /** Token budget */
  tokenBudget?: number;
}

/**
 * Default annotation templates
 */
const DEFAULT_ANNOTATION = 'This move {quality} the position. {reason}';
const DEFAULT_SUMMARY =
  'This was a {quality} game between {white} and {black}. The game featured {highlight}.';

/**
 * Create a mock LLM annotator
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createMockAnnotator(config: MockLlmConfig = {}) {
  const {
    annotations = new Map(),
    defaultAnnotation = DEFAULT_ANNOTATION,
    summaryTemplate = DEFAULT_SUMMARY,
    healthy = true,
    latencyMs = 0,
    shouldFail = false,
    tokenBudget = 5000,
  } = config;

  let tokensUsed = 0;

  const annotate = vi.fn(
    async (
      analysis: GameAnalysis,
      options?: { preferredVerbosity?: string; generateSummary?: boolean },
    ): Promise<AnnotationResult> => {
      if (latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
      }

      if (shouldFail) {
        throw new Error('LLM annotation failed');
      }

      // Clone the analysis to avoid mutating the original
      const annotatedAnalysis: GameAnalysis = JSON.parse(JSON.stringify(analysis));
      let positionsAnnotated = 0;

      // Add annotations to critical moments
      for (const criticalMoment of annotatedAnalysis.criticalMoments) {
        const move = annotatedAnalysis.moves[criticalMoment.plyIndex];
        if (move) {
          const customAnnotation = annotations.get(move.san);
          if (customAnnotation) {
            move.comment = customAnnotation;
          } else {
            move.comment = generateAnnotation(move, defaultAnnotation);
          }
          positionsAnnotated++;
          tokensUsed += 50; // Estimate tokens per annotation
        }
      }

      // Generate summary if requested
      if (options?.generateSummary !== false) {
        annotatedAnalysis.summary = generateSummary(annotatedAnalysis, summaryTemplate);
        tokensUsed += 100; // Estimate tokens for summary
      }

      return {
        analysis: annotatedAnalysis,
        tokenUsage: { used: tokensUsed, remaining: tokenBudget - tokensUsed },
        positionsAnnotated,
        summaryGenerated: options?.generateSummary !== false,
      };
    },
  );

  const getHealthStatus = vi.fn(() => ({
    healthy,
    circuitState: 'closed' as const,
    consecutiveFailures: 0,
  }));

  const getTokenUsage = vi.fn(() => ({
    used: tokensUsed,
    remaining: tokenBudget - tokensUsed,
  }));

  return {
    annotate,
    getHealthStatus,
    getTokenUsage,
    // For test inspection
    _config: config,
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    _resetTokens: () => {
      tokensUsed = 0;
    },
  };
}

/**
 * Generate an annotation based on move quality
 */
function generateAnnotation(
  move: { classification: string; san: string; cpLoss: number },
  template: string,
): string {
  const qualityMap: Record<string, { quality: string; reason: string }> = {
    brilliant: { quality: 'brilliantly improves', reason: 'A stunning tactical blow!' },
    excellent: { quality: 'excellently maintains', reason: 'Precise play.' },
    good: { quality: 'solidly develops', reason: 'A sensible move.' },
    inaccuracy: {
      quality: 'slightly weakens',
      reason: `Better was to look for alternatives. (${move.cpLoss}cp loss)`,
    },
    mistake: {
      quality: 'noticeably worsens',
      reason: `This allows counterplay. (${move.cpLoss}cp loss)`,
    },
    blunder: {
      quality: 'seriously damages',
      reason: `A critical error! (${move.cpLoss}cp loss)`,
    },
    book: { quality: 'follows theory in', reason: 'A standard opening move.' },
    forced: { quality: 'is the only legal move in', reason: 'No alternatives here.' },
  };

  const info = qualityMap[move.classification] ?? { quality: 'affects', reason: '' };

  return template.replace('{quality}', info.quality).replace('{reason}', info.reason);
}

/**
 * Generate a game summary
 */
function generateSummary(analysis: GameAnalysis, template: string): string {
  const { metadata, stats, criticalMoments } = analysis;

  // Determine game quality
  const totalBlunders = stats.white.blunders + stats.black.blunders;
  const totalMistakes = stats.white.mistakes + stats.black.mistakes;
  const quality =
    totalBlunders > 3
      ? 'wild tactical'
      : totalMistakes > 5
        ? 'fighting'
        : criticalMoments.length > 5
          ? 'complex'
          : 'solid';

  // Find a highlight
  const highlight =
    criticalMoments.length > 0
      ? `${criticalMoments.length} critical moments`
      : 'steady positional play';

  return template
    .replace('{quality}', quality)
    .replace('{white}', metadata.white)
    .replace('{black}', metadata.black)
    .replace('{highlight}', highlight);
}

export type MockAnnotator = ReturnType<typeof createMockAnnotator>;
