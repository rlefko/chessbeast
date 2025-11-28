/**
 * Cost tracking for LLM usage
 */

import type { TokenUsage } from '../client/types.js';

import { getModelPricing, calculateCost, type ModelPricing } from './pricing.js';

/**
 * Cost breakdown by category
 */
export interface CostBreakdown {
  /** Cost for input tokens */
  inputCost: number;
  /** Cost for output tokens */
  outputCost: number;
  /** Cost for reasoning tokens (if applicable) */
  reasoningCost: number;
  /** Total cost */
  totalCost: number;
}

/**
 * Complete cost tracking statistics
 */
export interface CostStats {
  /** Model used */
  model: string;
  /** Model pricing */
  pricing: ModelPricing;

  /** Token usage */
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;

  /** Number of API calls */
  apiCalls: number;
  /** Number of tool calls */
  toolCalls: number;

  /** Cost breakdown */
  costs: CostBreakdown;
}

/**
 * Format options for cost display
 */
export interface FormatOptions {
  /** Include token breakdown (default: true) */
  showTokens?: boolean;
  /** Include call counts (default: true) */
  showCalls?: boolean;
  /** Currency symbol (default: '$') */
  currency?: string;
  /** Decimal places for cost (default: 4) */
  costDecimals?: number;
}

/**
 * Cost tracker for monitoring LLM spending
 */
export class CostTracker {
  private model: string;
  private pricing: ModelPricing;

  private inputTokens: number = 0;
  private outputTokens: number = 0;
  private reasoningTokens: number = 0;
  private apiCalls: number = 0;
  private toolCalls: number = 0;

  constructor(model: string) {
    this.model = model;
    this.pricing = getModelPricing(model);
  }

  /**
   * Record token usage from an API call
   */
  recordUsage(usage: TokenUsage): void {
    this.inputTokens += usage.promptTokens;
    this.outputTokens += usage.completionTokens;
    if (usage.thinkingTokens) {
      this.reasoningTokens += usage.thinkingTokens;
    }
    this.apiCalls++;
  }

  /**
   * Record tool calls
   */
  recordToolCalls(count: number): void {
    this.toolCalls += count;
  }

  /**
   * Get current statistics
   */
  getStats(): CostStats {
    const costs = calculateCost(
      this.pricing,
      this.inputTokens,
      this.outputTokens,
      this.reasoningTokens,
    );

    return {
      model: this.model,
      pricing: this.pricing,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      reasoningTokens: this.reasoningTokens,
      totalTokens: this.inputTokens + this.outputTokens,
      apiCalls: this.apiCalls,
      toolCalls: this.toolCalls,
      costs,
    };
  }

  /**
   * Get estimated total cost so far
   */
  getTotalCost(): number {
    const costs = calculateCost(
      this.pricing,
      this.inputTokens,
      this.outputTokens,
      this.reasoningTokens,
    );
    return costs.totalCost;
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.reasoningTokens = 0;
    this.apiCalls = 0;
    this.toolCalls = 0;
  }

  /**
   * Update model and pricing
   */
  setModel(model: string): void {
    this.model = model;
    this.pricing = getModelPricing(model);
  }
}

/**
 * Format cost for display
 */
export function formatCost(cost: number, currency: string = '$', decimals: number = 4): string {
  if (cost < 0.0001) {
    return `< ${currency}0.0001`;
  }
  return `${currency}${cost.toFixed(decimals)}`;
}

/**
 * Format token count for display
 */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(2)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

/**
 * Format cost stats as a multi-line display string
 */
export function formatCostStats(stats: CostStats, options: FormatOptions = {}): string {
  const { showTokens = true, showCalls = true, currency = '$', costDecimals = 4 } = options;

  const lines: string[] = [];
  const divider = '─'.repeat(45);

  lines.push(divider);

  if (showCalls) {
    lines.push(`  API calls:        ${stats.apiCalls}`);
    if (stats.toolCalls > 0) {
      lines.push(`  Tool calls:       ${stats.toolCalls}`);
    }
    lines.push(divider);
  }

  if (showTokens) {
    lines.push(`  Token usage:`);
    lines.push(`    Input:          ${formatTokens(stats.inputTokens)} tokens`);
    lines.push(`    Output:         ${formatTokens(stats.outputTokens)} tokens`);
    if (stats.reasoningTokens > 0) {
      lines.push(`    Reasoning:      ${formatTokens(stats.reasoningTokens)} tokens`);
    }
    lines.push(divider);
  }

  lines.push(`  Estimated cost:   ${formatCost(stats.costs.totalCost, currency, costDecimals)}`);
  lines.push(divider);

  return lines.join('\n');
}
