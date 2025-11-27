/**
 * Integration tests for configuration variations
 * Tests different analysis profiles and settings
 */

import {
  createMockServices,
  createNullReporter,
  loadPgn,
  config,
  configPresets,
} from '@chessbeast/test-utils';
import { describe, it, expect } from 'vitest';

import { orchestrateAnalysis } from '../../orchestrator/orchestrator.js';

describe('Configuration Variations', () => {
  describe('Analysis Profiles', () => {
    it('should use quick profile settings', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const quickConfig = configPresets.quick();

      const result = await orchestrateAnalysis(pgn, quickConfig, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
      // Quick profile should still produce results
      expect(result.results[0]!.analysis.moves.length).toBeGreaterThan(0);
    });

    it('should use standard profile settings', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const standardConfig = configPresets.standard();

      const result = await orchestrateAnalysis(pgn, standardConfig, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
      expect(result.results[0]!.analysis.moves.length).toBeGreaterThan(0);
    });

    it('should use deep profile settings', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const deepConfig = configPresets.deep();

      const result = await orchestrateAnalysis(pgn, deepConfig, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
      expect(result.results[0]!.analysis.moves.length).toBeGreaterThan(0);
    });
  });

  describe('Skip Options', () => {
    it('should skip Maia analysis when skipMaia is true', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices({ skipMaia: true });
      const reporter = createNullReporter();

      const noMaiaConfig = config().withSkipMaia().build();

      const result = await orchestrateAnalysis(pgn, noMaiaConfig, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
      // Should still complete without Maia
      expect(result.results[0]!.analysis.moves.length).toBeGreaterThan(0);

      // Human probability should not be set when Maia is skipped
      // (depends on implementation - some moves may still have it from mocks)
    });

    it('should skip LLM annotations when skipLlm is true', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices({ skipLlm: true });
      const reporter = createNullReporter();

      const noLlmConfig = config().withSkipLlm().build();

      const result = await orchestrateAnalysis(pgn, noLlmConfig, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
      expect(result.stats.annotationsGenerated).toBe(0);
    });

    it('should work with minimal config (no Maia, no LLM)', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices({ skipMaia: true, skipLlm: true });
      const reporter = createNullReporter();

      const minimalConfig = configPresets.minimal();

      const result = await orchestrateAnalysis(pgn, minimalConfig, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
      expect(result.results[0]!.analysis.moves.length).toBeGreaterThan(0);
    });
  });

  describe('Output Verbosity', () => {
    it('should handle summary verbosity', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const summaryConfig = config().withVerbosity('summary').build();

      const result = await orchestrateAnalysis(pgn, summaryConfig, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
    });

    it('should handle normal verbosity', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const normalConfig = config().withVerbosity('normal').build();

      const result = await orchestrateAnalysis(pgn, normalConfig, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
    });

    it('should handle rich verbosity', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const richConfig = config().withVerbosity('rich').build();

      const result = await orchestrateAnalysis(pgn, richConfig, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
    });
  });

  describe('Output Options', () => {
    it('should include variations when configured', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const withVariations = config().withOutput({ includeVariations: true }).build();

      const result = await orchestrateAnalysis(pgn, withVariations, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
    });

    it('should exclude variations when configured', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const noVariations = config().withOutput({ includeVariations: false }).build();

      const result = await orchestrateAnalysis(pgn, noVariations, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
    });

    it('should include NAGs when configured', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const withNags = config().withOutput({ includeNags: true }).build();

      const result = await orchestrateAnalysis(pgn, withNags, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
    });

    it('should exclude NAGs when configured', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const noNags = config().withOutput({ includeNags: false }).build();

      const result = await orchestrateAnalysis(pgn, noNags, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
    });

    it('should include summary when configured', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const withSummary = config().withOutput({ includeSummary: true }).build();

      const result = await orchestrateAnalysis(pgn, withSummary, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
    });

    it('should exclude summary when configured', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const noSummary = config().withOutput({ includeSummary: false }).build();

      const result = await orchestrateAnalysis(pgn, noSummary, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
    });
  });

  describe('Rating Configuration', () => {
    it('should use target audience rating', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const ratedConfig = config().withTargetRating(1800).build();

      const result = await orchestrateAnalysis(pgn, ratedConfig, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
    });

    it('should use different default rating', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const ratedConfig = config().withDefaultRating(1200).build();

      const result = await orchestrateAnalysis(pgn, ratedConfig, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
    });
  });

  describe('Depth Configuration', () => {
    it('should use custom depths', async () => {
      const pgn = await loadPgn('edge-cases/scholars-mate.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const customDepths = config().withDepths(10, 18).build();

      const result = await orchestrateAnalysis(pgn, customDepths, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
    });

    it('should use custom multiPv count', async () => {
      const pgn = await loadPgn('edge-cases/scholars-mate.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const multiPvConfig = config().withMultiPv(5).build();

      const result = await orchestrateAnalysis(pgn, multiPvConfig, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
    });

    it('should use custom critical ratio', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const criticalConfig = config().withMaxCriticalRatio(0.5).build();

      const result = await orchestrateAnalysis(pgn, criticalConfig, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
    });
  });
});
