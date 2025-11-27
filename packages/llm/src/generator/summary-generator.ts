/**
 * Game summary generator
 */

import type { GameAnalysis } from '@chessbeast/core';

import type { OpenAIClient } from '../client/openai-client.js';
import type { LLMConfig } from '../config/llm-config.js';
import { GAME_SUMMARY_SYSTEM } from '../prompts/system-prompts.js';
import { buildSummaryPrompt } from '../prompts/templates.js';
import type { GeneratedSummary } from '../validator/output-validator.js';
import { parseJsonResponse, validateSummary } from '../validator/output-validator.js';

import { generateFallbackSummary } from './fallback-generator.js';

/**
 * Generate a game summary using LLM
 */
export class SummaryGenerator {
  constructor(
    private readonly client: OpenAIClient,
    private readonly config: LLMConfig,
  ) {}

  /**
   * Generate a summary for the analyzed game
   */
  async generateSummary(
    analysis: GameAnalysis,
    targetRating: number,
  ): Promise<GeneratedSummary> {
    // Check if we can afford the summary
    if (!this.client.canAfford(this.config.budget.maxTokensPerSummary)) {
      console.warn('Not enough token budget for summary, using fallback');
      return generateFallbackSummary(analysis);
    }

    try {
      const prompt = buildSummaryPrompt(analysis, targetRating);

      const response = await this.client.chat({
        messages: [
          { role: 'system', content: GAME_SUMMARY_SYSTEM },
          { role: 'user', content: prompt },
        ],
        temperature: this.config.temperature,
        responseFormat: 'json',
        maxTokens: this.config.budget.maxTokensPerSummary,
      });

      // Parse and validate response
      const parsed = parseJsonResponse<unknown>(response.content);
      const validation = validateSummary(parsed);

      if (!validation.valid) {
        console.warn('Summary validation failed, using fallback:', validation.issues);
        return generateFallbackSummary(analysis);
      }

      return validation.sanitized;
    } catch (error) {
      // Log and return fallback
      if (error instanceof Error) {
        console.warn(`Summary generation failed: ${error.message}`);
      }
      return generateFallbackSummary(analysis);
    }
  }
}

/**
 * Format a generated summary as a string for display
 */
export function formatSummaryAsString(summary: GeneratedSummary): string {
  const parts: string[] = [];

  if (summary.openingSynopsis) {
    parts.push(`Opening: ${summary.openingSynopsis}`);
  }

  parts.push(`\n${summary.gameNarrative}`);

  if (summary.keyMoments && summary.keyMoments.length > 0) {
    parts.push('\nKey moments:');
    for (const moment of summary.keyMoments) {
      parts.push(`- Move ${moment.moveNumber}: ${moment.description}`);
    }
  }

  if (summary.lessonsLearned.length > 0) {
    parts.push('\nLessons:');
    for (const lesson of summary.lessonsLearned) {
      parts.push(`- ${lesson}`);
    }
  }

  return parts.join('\n');
}
