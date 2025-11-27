/**
 * Tests for annotation planner
 */

import { describe, it, expect } from 'vitest';

import { DEFAULT_TOKEN_BUDGET } from '../config/llm-config.js';
import { createAnnotationPlan } from '../planner/annotation-planner.js';
import {
  calculateVerbosity,
  shouldAnnotate,
  estimateTokens,
  TOKENS_BY_VERBOSITY,
} from '../planner/verbosity.js';

import { createMockGameAnalysis } from './mocks/mock-openai.js';

describe('Verbosity Calculator', () => {
  describe('calculateVerbosity', () => {
    it('should return brief when budget is very low', () => {
      const result = calculateVerbosity(50, 5, false, 'detailed');
      expect(result).toBe('brief');
    });

    it('should prioritize critical moments for verbosity', () => {
      // avgBudget = 900/2 = 450 >= TOKENS_BY_VERBOSITY.detailed (450)
      const result = calculateVerbosity(900, 2, true, 'detailed');
      expect(result).toBe('detailed');
    });

    it('should reduce non-critical verbosity when budget is tight', () => {
      // avgBudget = 500/2 = 250 >= TOKENS_BY_VERBOSITY.normal (250)
      const result = calculateVerbosity(500, 2, false, 'detailed');
      expect(result).toBe('normal');
    });

    it('should respect user preference when budget allows', () => {
      const result = calculateVerbosity(5000, 5, false, 'detailed');
      expect(result).toBe('detailed');
    });
  });

  describe('shouldAnnotate', () => {
    it('should always annotate critical moments', () => {
      expect(shouldAnnotate('good', true)).toBe(true);
    });

    it('should annotate blunders and mistakes', () => {
      expect(shouldAnnotate('blunder', false)).toBe(true);
      expect(shouldAnnotate('mistake', false)).toBe(true);
    });

    it('should annotate brilliant moves', () => {
      expect(shouldAnnotate('brilliant', false)).toBe(true);
    });

    it('should skip normal good moves', () => {
      expect(shouldAnnotate('good', false)).toBe(false);
    });

    it('should annotate unexpected moves (low human probability)', () => {
      expect(shouldAnnotate('good', false, 0.05)).toBe(true);
    });
  });

  describe('estimateTokens', () => {
    it('should return base tokens for non-critical', () => {
      expect(estimateTokens('normal', false)).toBe(TOKENS_BY_VERBOSITY.normal);
    });

    it('should add multiplier for critical moments', () => {
      const critical = estimateTokens('normal', true);
      const nonCritical = estimateTokens('normal', false);
      expect(critical).toBeGreaterThan(nonCritical);
    });
  });
});

describe('Annotation Planner', () => {
  describe('createAnnotationPlan', () => {
    it('should create a plan from game analysis', () => {
      const analysis = createMockGameAnalysis();
      const plan = createAnnotationPlan(analysis, DEFAULT_TOKEN_BUDGET);

      expect(plan.positions.length).toBeGreaterThan(0);
      expect(plan.generateSummary).toBe(true);
      expect(plan.targetRating).toBe(1500);
    });

    it('should include critical moments', () => {
      const analysis = createMockGameAnalysis();
      const plan = createAnnotationPlan(analysis, DEFAULT_TOKEN_BUDGET);

      const criticalPositions = plan.positions.filter((p) => p.criticalMoment);
      expect(criticalPositions.length).toBeGreaterThan(0);
    });

    it('should sort positions by game order', () => {
      const analysis = createMockGameAnalysis();
      const plan = createAnnotationPlan(analysis, DEFAULT_TOKEN_BUDGET);

      for (let i = 1; i < plan.positions.length; i++) {
        expect(plan.positions[i]!.plyIndex).toBeGreaterThanOrEqual(plan.positions[i - 1]!.plyIndex);
      }
    });

    it('should respect maxPositions option', () => {
      const analysis = createMockGameAnalysis();
      const plan = createAnnotationPlan(analysis, DEFAULT_TOKEN_BUDGET, {
        maxPositions: 1,
      });

      expect(plan.positions.length).toBeLessThanOrEqual(1);
    });

    it('should estimate total tokens', () => {
      const analysis = createMockGameAnalysis();
      const plan = createAnnotationPlan(analysis, DEFAULT_TOKEN_BUDGET);

      expect(plan.estimatedTokens).toBeGreaterThan(0);
    });

    it('should detect opening name from metadata', () => {
      const analysis = createMockGameAnalysis();
      const plan = createAnnotationPlan(analysis, DEFAULT_TOKEN_BUDGET);

      expect(plan.openingName).toBe('Sicilian Defense');
    });
  });
});
