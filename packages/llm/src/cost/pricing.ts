/**
 * Model pricing data for cost estimation
 *
 * Prices are per 1M tokens (in dollars)
 */

/**
 * Pricing for a model
 */
export interface ModelPricing {
  /** Price per 1M input tokens */
  input: number;
  /** Price per 1M output tokens */
  output: number;
  /** Price per 1M reasoning/thinking tokens (for reasoning models) */
  reasoning?: number;
}

/**
 * Model pricing database
 * Updated as of November 2024
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // GPT-4o series
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-2024-11-20': { input: 2.5, output: 10.0 },
  'gpt-4o-2024-08-06': { input: 2.5, output: 10.0 },
  'gpt-4o-2024-05-13': { input: 5.0, output: 15.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.6 },

  // GPT-4 Turbo
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4-turbo-2024-04-09': { input: 10.0, output: 30.0 },
  'gpt-4-turbo-preview': { input: 10.0, output: 30.0 },
  'gpt-4-1106-preview': { input: 10.0, output: 30.0 },
  'gpt-4-0125-preview': { input: 10.0, output: 30.0 },

  // GPT-4 (original)
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-4-0613': { input: 30.0, output: 60.0 },
  'gpt-4-32k': { input: 60.0, output: 120.0 },

  // GPT-3.5 Turbo
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'gpt-3.5-turbo-0125': { input: 0.5, output: 1.5 },
  'gpt-3.5-turbo-1106': { input: 1.0, output: 2.0 },
  'gpt-3.5-turbo-16k': { input: 3.0, output: 4.0 },

  // Reasoning models
  o1: { input: 15.0, output: 60.0, reasoning: 60.0 },
  'o1-preview': { input: 15.0, output: 60.0, reasoning: 60.0 },
  'o1-mini': { input: 3.0, output: 12.0, reasoning: 12.0 },
  'o3-mini': { input: 1.1, output: 4.4, reasoning: 4.4 },

  // Codex / Hypothetical gpt-5
  'gpt-5-codex': { input: 2.5, output: 10.0, reasoning: 10.0 },
  'codex-mini': { input: 0.15, output: 0.6 },
};

/**
 * Default pricing for unknown models (use conservative estimate)
 */
export const DEFAULT_PRICING: ModelPricing = {
  input: 10.0,
  output: 30.0,
};

/**
 * Get pricing for a model
 * Falls back to default pricing if model is unknown
 */
export function getModelPricing(model: string): ModelPricing {
  // Try exact match first
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }

  // Try to match model family
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(key) || key.startsWith(model)) {
      return pricing;
    }
  }

  // Return default pricing with warning
  console.warn(`Unknown model "${model}", using default pricing`);
  return DEFAULT_PRICING;
}

/**
 * Calculate cost in dollars from token counts
 */
export function calculateCost(
  pricing: ModelPricing,
  inputTokens: number,
  outputTokens: number,
  reasoningTokens: number = 0,
): { inputCost: number; outputCost: number; reasoningCost: number; totalCost: number } {
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const reasoningCost = pricing.reasoning ? (reasoningTokens / 1_000_000) * pricing.reasoning : 0;

  return {
    inputCost,
    outputCost,
    reasoningCost,
    totalCost: inputCost + outputCost + reasoningCost,
  };
}
