/**
 * Tests for cost tracking module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  MODEL_PRICING,
  DEFAULT_PRICING,
  getModelPricing,
  calculateCost,
} from '../cost/pricing.js';
import {
  CostTracker,
  formatCost,
  formatTokens,
  formatCostStats,
} from '../cost/tracker.js';

describe('Model Pricing', () => {
  describe('MODEL_PRICING', () => {
    it('should have pricing for GPT-4o models', () => {
      expect(MODEL_PRICING['gpt-4o']).toBeDefined();
      expect(MODEL_PRICING['gpt-4o']!.input).toBe(2.5);
      expect(MODEL_PRICING['gpt-4o']!.output).toBe(10.0);
    });

    it('should have pricing for GPT-4o-mini models', () => {
      expect(MODEL_PRICING['gpt-4o-mini']).toBeDefined();
      expect(MODEL_PRICING['gpt-4o-mini']!.input).toBe(0.15);
      expect(MODEL_PRICING['gpt-4o-mini']!.output).toBe(0.6);
    });

    it('should have reasoning pricing for o1 models', () => {
      expect(MODEL_PRICING['o1']).toBeDefined();
      expect(MODEL_PRICING['o1']!.reasoning).toBe(60.0);
    });

    it('should have pricing for gpt-5-codex', () => {
      expect(MODEL_PRICING['gpt-5-codex']).toBeDefined();
      expect(MODEL_PRICING['gpt-5-codex']!.reasoning).toBe(10.0);
    });
  });

  describe('getModelPricing', () => {
    it('should return exact match pricing', () => {
      const pricing = getModelPricing('gpt-4o');
      expect(pricing.input).toBe(2.5);
      expect(pricing.output).toBe(10.0);
    });

    it('should return default pricing for unknown models', () => {
      // Suppress console.warn during test
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const pricing = getModelPricing('unknown-model-xyz');
      expect(pricing).toEqual(DEFAULT_PRICING);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown model'),
      );

      warnSpy.mockRestore();
    });

    it('should match model families (prefix matching)', () => {
      const pricing = getModelPricing('gpt-4o-2024-11-20');
      expect(pricing.input).toBe(2.5);
      expect(pricing.output).toBe(10.0);
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost correctly', () => {
      const pricing = { input: 10.0, output: 30.0 };
      const result = calculateCost(pricing, 1_000_000, 500_000, 0);

      expect(result.inputCost).toBe(10.0);
      expect(result.outputCost).toBe(15.0);
      expect(result.reasoningCost).toBe(0);
      expect(result.totalCost).toBe(25.0);
    });

    it('should calculate reasoning cost when applicable', () => {
      const pricing = { input: 15.0, output: 60.0, reasoning: 60.0 };
      const result = calculateCost(pricing, 1_000_000, 500_000, 200_000);

      expect(result.inputCost).toBe(15.0);
      expect(result.outputCost).toBe(30.0);
      expect(result.reasoningCost).toBe(12.0);
      expect(result.totalCost).toBe(57.0);
    });

    it('should handle zero tokens', () => {
      const pricing = { input: 10.0, output: 30.0 };
      const result = calculateCost(pricing, 0, 0, 0);

      expect(result.totalCost).toBe(0);
    });
  });
});

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker('gpt-4o');
  });

  describe('recordUsage', () => {
    it('should accumulate token usage', () => {
      tracker.recordUsage({
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      });

      const stats = tracker.getStats();
      expect(stats.inputTokens).toBe(1000);
      expect(stats.outputTokens).toBe(500);
    });

    it('should track thinking tokens', () => {
      tracker.recordUsage({
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1700,
        thinkingTokens: 200,
      });

      const stats = tracker.getStats();
      expect(stats.reasoningTokens).toBe(200);
    });

    it('should count API calls', () => {
      tracker.recordUsage({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
      tracker.recordUsage({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });

      const stats = tracker.getStats();
      expect(stats.apiCalls).toBe(2);
    });
  });

  describe('recordToolCalls', () => {
    it('should track tool calls', () => {
      tracker.recordToolCalls(3);
      tracker.recordToolCalls(2);

      const stats = tracker.getStats();
      expect(stats.toolCalls).toBe(5);
    });
  });

  describe('getStats', () => {
    it('should return complete statistics', () => {
      tracker.recordUsage({
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      });
      tracker.recordToolCalls(2);

      const stats = tracker.getStats();
      expect(stats.model).toBe('gpt-4o');
      expect(stats.inputTokens).toBe(1000);
      expect(stats.outputTokens).toBe(500);
      expect(stats.totalTokens).toBe(1500);
      expect(stats.apiCalls).toBe(1);
      expect(stats.toolCalls).toBe(2);
      expect(stats.costs).toBeDefined();
    });
  });

  describe('getTotalCost', () => {
    it('should return calculated total cost', () => {
      tracker.recordUsage({
        promptTokens: 1_000_000,
        completionTokens: 100_000,
        totalTokens: 1_100_000,
      });

      const cost = tracker.getTotalCost();
      // gpt-4o: $2.5/1M input, $10/1M output
      // 1M input = $2.5, 100K output = $1.0
      expect(cost).toBeCloseTo(3.5);
    });
  });

  describe('reset', () => {
    it('should reset all counters', () => {
      tracker.recordUsage({
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      });
      tracker.recordToolCalls(5);

      tracker.reset();

      const stats = tracker.getStats();
      expect(stats.inputTokens).toBe(0);
      expect(stats.outputTokens).toBe(0);
      expect(stats.apiCalls).toBe(0);
      expect(stats.toolCalls).toBe(0);
    });
  });

  describe('setModel', () => {
    it('should update model and pricing', () => {
      tracker.setModel('gpt-4o-mini');

      tracker.recordUsage({
        promptTokens: 1_000_000,
        completionTokens: 100_000,
        totalTokens: 1_100_000,
      });

      const stats = tracker.getStats();
      expect(stats.model).toBe('gpt-4o-mini');
      // gpt-4o-mini: $0.15/1M input, $0.6/1M output
      expect(stats.costs.totalCost).toBeCloseTo(0.21);
    });
  });
});

describe('Formatting Functions', () => {
  describe('formatCost', () => {
    it('should format cost with dollar sign', () => {
      expect(formatCost(1.5)).toBe('$1.5000');
    });

    it('should handle very small costs', () => {
      expect(formatCost(0.00001)).toBe('< $0.0001');
    });

    it('should use custom currency', () => {
      expect(formatCost(1.5, '€')).toBe('€1.5000');
    });

    it('should use custom decimal places', () => {
      expect(formatCost(1.5, '$', 2)).toBe('$1.50');
    });
  });

  describe('formatTokens', () => {
    it('should format small numbers as-is', () => {
      expect(formatTokens(500)).toBe('500');
    });

    it('should format thousands with K', () => {
      expect(formatTokens(1500)).toBe('1.5K');
      expect(formatTokens(10000)).toBe('10.0K');
    });

    it('should format millions with M', () => {
      expect(formatTokens(1_500_000)).toBe('1.50M');
    });
  });

  describe('formatCostStats', () => {
    it('should format stats as multi-line string', () => {
      const stats = {
        model: 'gpt-4o',
        pricing: { input: 2.5, output: 10.0 },
        inputTokens: 10000,
        outputTokens: 5000,
        reasoningTokens: 0,
        totalTokens: 15000,
        apiCalls: 3,
        toolCalls: 5,
        costs: {
          inputCost: 0.025,
          outputCost: 0.05,
          reasoningCost: 0,
          totalCost: 0.075,
        },
      };

      const formatted = formatCostStats(stats);
      expect(formatted).toContain('API calls');
      expect(formatted).toContain('3');
      expect(formatted).toContain('Tool calls');
      expect(formatted).toContain('5');
      expect(formatted).toContain('Input:');
      expect(formatted).toContain('10.0K');
      expect(formatted).toContain('Estimated cost:');
    });

    it('should hide tokens when showTokens is false', () => {
      const stats = {
        model: 'gpt-4o',
        pricing: { input: 2.5, output: 10.0 },
        inputTokens: 10000,
        outputTokens: 5000,
        reasoningTokens: 0,
        totalTokens: 15000,
        apiCalls: 3,
        toolCalls: 0,
        costs: {
          inputCost: 0.025,
          outputCost: 0.05,
          reasoningCost: 0,
          totalCost: 0.075,
        },
      };

      const formatted = formatCostStats(stats, { showTokens: false });
      expect(formatted).not.toContain('Input:');
      expect(formatted).toContain('Estimated cost:');
    });
  });
});
