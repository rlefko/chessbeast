/**
 * Tiebreaker Role
 *
 * LLM role for candidate selection when algorithmic methods are insufficient.
 * Used when top candidates have similar evaluations and human probabilities.
 */

import type { CandidateSummary, TiebreakerInput, TiebreakerResult } from '../agent-cards/types.js';
import type { OpenAIClient } from '../client/openai-client.js';
import { CircuitOpenError, RateLimitError } from '../errors.js';

import type { RoleConfig, RoleError } from './types.js';
import { getRoleConfig } from './types.js';

/**
 * Tiebreaker role configuration
 */
export interface TiebreakerRoleConfig {
  /** Base role config overrides */
  roleConfig?: Partial<RoleConfig>;

  /** Minimum eval difference to skip tiebreaker (cp) */
  minEvalDifference: number;

  /** Minimum Maia probability difference to skip tiebreaker */
  minMaiaDifference: number;
}

/**
 * Default tiebreaker role configuration
 */
export const DEFAULT_TIEBREAKER_ROLE_CONFIG: TiebreakerRoleConfig = {
  minEvalDifference: 30,
  minMaiaDifference: 0.15,
};

/**
 * Tiebreaker Role
 *
 * Helps decide between algorithmically similar candidates.
 */
export class TiebreakerRole {
  private readonly config: TiebreakerRoleConfig;
  private readonly roleConfig: RoleConfig;

  constructor(
    private readonly client: OpenAIClient | undefined,
    config: Partial<TiebreakerRoleConfig> = {},
  ) {
    this.config = { ...DEFAULT_TIEBREAKER_ROLE_CONFIG, ...config };
    this.roleConfig = getRoleConfig('tiebreaker', config.roleConfig);
  }

  /**
   * Decide between top candidates
   */
  async decide(input: TiebreakerInput): Promise<TiebreakerResult | RoleError> {
    // If no client or candidates clearly differ, use algorithmic selection
    if (this.client === undefined || !this.shouldInvoke(input.topCandidates)) {
      return this.selectAlgorithmically(input.topCandidates);
    }

    const prompt = this.buildPrompt(input);

    try {
      const response = await this.client.chat({
        messages: [
          { role: 'system', content: this.roleConfig.systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: this.roleConfig.temperature,
      });

      return this.parseResponse(response.content, input.topCandidates, response.usage?.totalTokens);
    } catch (error) {
      return this.handleError(error, input.topCandidates);
    }
  }

  /**
   * Check if tiebreaker should be invoked
   *
   * Returns true if candidates are too close to select algorithmically.
   */
  shouldInvoke(candidates: CandidateSummary[]): boolean {
    if (candidates.length < 2) return false;

    // Sort by eval
    const sorted = [...candidates].sort((a, b) => b.evalCp - a.evalCp);
    const best = sorted[0]!;
    const second = sorted[1]!;

    // Check eval difference
    const evalDiff = best.evalCp - second.evalCp;
    if (evalDiff >= this.config.minEvalDifference) {
      return false; // Clear best by eval
    }

    // Check Maia difference
    if (best.humanProb !== undefined && second.humanProb !== undefined) {
      const maiaDiff = Math.abs(best.humanProb - second.humanProb);
      if (maiaDiff >= this.config.minMaiaDifference) {
        return false; // Clear preference by human probability
      }
    }

    // Candidates are too close - need tiebreaker
    return true;
  }

  /**
   * Build the user prompt for tiebreaker
   */
  buildPrompt(input: TiebreakerInput): string {
    const { card, topCandidates, question } = input;
    const parts: string[] = [];

    // Position context
    parts.push(`Position: Ply ${card.ply}, ${card.sideToMove === 'w' ? 'White' : 'Black'} to move`);
    parts.push(`Criticality: ${card.criticalityScore.toFixed(0)}/100`);

    // Evaluation
    if (card.eval.cp !== undefined) {
      const evalStr =
        card.eval.cp >= 0 ? `+${(card.eval.cp / 100).toFixed(1)}` : (card.eval.cp / 100).toFixed(1);
      parts.push(`Position eval: ${evalStr}`);
    }

    // Theme context
    if (card.themeDeltas.length > 0) {
      parts.push(`\nActive themes: ${card.themeDeltas.map((t) => t.type).join(', ')}`);
    }

    // Narrative focus
    if (card.lineContext.focus !== undefined) {
      parts.push(`Current focus: ${card.lineContext.focus}`);
    }

    // Candidates
    parts.push('\n--- Candidates ---');
    for (const candidate of topCandidates) {
      const evalStr =
        candidate.evalCp >= 0
          ? `+${(candidate.evalCp / 100).toFixed(2)}`
          : (candidate.evalCp / 100).toFixed(2);
      const humanStr =
        candidate.humanProb !== undefined
          ? ` (${(candidate.humanProb * 100).toFixed(0)}% human)`
          : '';
      const pvStr =
        candidate.pvPreview !== undefined && candidate.pvPreview.length > 0
          ? ` → ${candidate.pvPreview.join(' ')}`
          : '';

      parts.push(`${candidate.san}: ${evalStr}${humanStr} - ${candidate.reason}${pvStr}`);
    }

    // Question
    parts.push(`\n--- Question ---`);
    parts.push(question);

    parts.push('\nRespond with: "MOVE: <san>, REASON: <explanation>"');

    return parts.join('\n');
  }

  /**
   * Parse LLM response
   */
  private parseResponse(
    response: string,
    candidates: CandidateSummary[],
    tokensUsed?: number,
  ): TiebreakerResult | RoleError {
    // Expected format: "MOVE: Nf3, REASON: more instructive follow-up"
    const moveMatch = response.match(/MOVE:\s*(\S+)/i);
    const reasonMatch = response.match(/REASON:\s*(.+?)(?:$|\.)/i);

    if (moveMatch === null) {
      // Parse failed - use algorithmic fallback
      const fallback = this.selectAlgorithmically(candidates);
      return {
        ...fallback,
        tokensUsed: tokensUsed ?? 0,
        confidence: 0.5,
      };
    }

    const selectedMove = moveMatch[1]!;
    const reasoning = reasonMatch !== null ? reasonMatch[1]!.trim() : 'No reason provided';

    // Validate that selected move is one of the candidates
    const isValidMove = candidates.some((c) => c.san === selectedMove);
    if (!isValidMove) {
      // LLM hallucinated a move - use algorithmic fallback
      const fallback = this.selectAlgorithmically(candidates);
      return {
        ...fallback,
        tokensUsed: tokensUsed ?? 0,
        confidence: 0.4,
      };
    }

    return {
      selectedMove,
      reasoning,
      confidence: 0.8,
      tokensUsed: tokensUsed ?? 0,
    };
  }

  /**
   * Select algorithmically when LLM is not needed
   */
  private selectAlgorithmically(candidates: CandidateSummary[]): TiebreakerResult {
    if (candidates.length === 0) {
      return {
        selectedMove: '',
        reasoning: 'No candidates available',
        confidence: 0,
        tokensUsed: 0,
      };
    }

    // Prefer by source priority
    const sourcePriority: Record<string, number> = {
      attractive_but_bad: 10,
      sacrifice: 9,
      engine_best: 8,
      blunder: 7,
      scary_check: 6,
      scary_capture: 5,
      maia_preferred: 4,
      near_best: 3,
      human_popular: 2,
      quiet_improvement: 1,
    };

    const sorted = [...candidates].sort((a, b) => {
      const aPriority = sourcePriority[a.source] ?? 0;
      const bPriority = sourcePriority[b.source] ?? 0;

      if (aPriority !== bPriority) return bPriority - aPriority;

      // Then by eval
      return b.evalCp - a.evalCp;
    });

    const selected = sorted[0]!;

    return {
      selectedMove: selected.san,
      reasoning: `Selected by source priority (${selected.source})`,
      confidence: 0.7,
      tokensUsed: 0,
    };
  }

  /**
   * Handle errors from LLM calls
   */
  private handleError(
    error: unknown,
    candidates: CandidateSummary[],
  ): TiebreakerResult | RoleError {
    if (error instanceof CircuitOpenError) {
      // Use algorithmic fallback
      return this.selectAlgorithmically(candidates);
    }

    if (error instanceof RateLimitError) {
      // Use algorithmic fallback
      return this.selectAlgorithmically(candidates);
    }

    return {
      code: 'unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      useFallback: true,
    };
  }
}

/**
 * Create a tiebreaker role instance
 */
export function createTiebreakerRole(
  client: OpenAIClient | undefined,
  config?: Partial<TiebreakerRoleConfig>,
): TiebreakerRole {
  return new TiebreakerRole(client, config);
}

/**
 * Quick check if tiebreaker is needed
 */
export function needsTiebreaker(
  candidates: CandidateSummary[],
  config: Partial<TiebreakerRoleConfig> = {},
): boolean {
  const role = new TiebreakerRole(undefined, config);
  return role.shouldInvoke(candidates);
}
