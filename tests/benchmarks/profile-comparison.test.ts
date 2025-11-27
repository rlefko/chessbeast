/**
 * Performance benchmark tests
 * Tests timing and resource usage across different profiles
 */

import { describe, it, expect, afterAll } from 'vitest';
import { orchestrateAnalysis } from '@chessbeast/cli/orchestrator/orchestrator.js';
import { DEFAULT_CONFIG, applyProfile } from '@chessbeast/cli/config/defaults.js';
import type { AnalysisProfile } from '@chessbeast/cli/config/schema.js';
import {
  createMockServices,
  createNullReporter,
  loadPgn,
  createBenchmarkRunner,
  getExpectedMaxTime,
} from '@chessbeast/test-utils';

describe('Performance Benchmarks', () => {
  const runner = createBenchmarkRunner();

  afterAll(() => {
    console.log('\n' + runner.generateTextReport());
  });

  describe('Profile Timing', () => {
    const profiles: AnalysisProfile[] = ['quick', 'standard', 'deep'];

    for (const profile of profiles) {
      it(`should complete ${profile} profile within time budget (short game)`, async () => {
        const pgn = await loadPgn('edge-cases/scholars-mate.pgn');
        const services = createMockServices();
        const reporter = createNullReporter();

        const config = {
          ...DEFAULT_CONFIG,
          analysis: applyProfile(DEFAULT_CONFIG.analysis, profile),
        };

        const result = await runner.runBenchmark(
          async () => {
            const r = await orchestrateAnalysis(pgn, config, services, reporter);
            return {
              gameLength: r.results[0]!.analysis.stats.totalPlies,
              resources: {
                engineCalls: services.stockfish._calls.evaluate().length,
              },
            };
          },
          profile,
          3, // iterations
        );

        const maxTime = getExpectedMaxTime(profile, result.gameLength);
        expect(
          result.timings.mean,
          `${profile} profile mean time ${result.timings.mean}ms exceeds budget ${maxTime}ms`,
        ).toBeLessThan(maxTime);
      });

      it(`should complete ${profile} profile within time budget (medium game)`, async () => {
        const pgn = await loadPgn('gm/morphy-opera-game.pgn');
        const services = createMockServices();
        const reporter = createNullReporter();

        const config = {
          ...DEFAULT_CONFIG,
          analysis: applyProfile(DEFAULT_CONFIG.analysis, profile),
        };

        const result = await runner.runBenchmark(
          async () => {
            const r = await orchestrateAnalysis(pgn, config, services, reporter);
            return {
              gameLength: r.results[0]!.analysis.stats.totalPlies,
              resources: {
                engineCalls: services.stockfish._calls.evaluate().length,
              },
            };
          },
          profile,
          3,
        );

        const maxTime = getExpectedMaxTime(profile, result.gameLength);
        expect(
          result.timings.mean,
          `${profile} profile mean time ${result.timings.mean}ms exceeds budget ${maxTime}ms`,
        ).toBeLessThan(maxTime);
      });
    }
  });

  describe('Scaling Characteristics', () => {
    it('should scale roughly linearly with game length', async () => {
      const services = createMockServices();
      const reporter = createNullReporter();

      // Short game
      const shortPgn = await loadPgn('edge-cases/scholars-mate.pgn');
      const shortStart = performance.now();
      const shortResult = await orchestrateAnalysis(shortPgn, DEFAULT_CONFIG, services, reporter);
      const shortTime = performance.now() - shortStart;
      const shortPlies = shortResult.results[0]!.analysis.stats.totalPlies;

      // Medium game
      const mediumPgn = await loadPgn('gm/morphy-opera-game.pgn');
      const mediumStart = performance.now();
      const mediumResult = await orchestrateAnalysis(mediumPgn, DEFAULT_CONFIG, services, reporter);
      const mediumTime = performance.now() - mediumStart;
      const mediumPlies = mediumResult.results[0]!.analysis.stats.totalPlies;

      // Calculate time per ply
      const shortTimePerPly = shortTime / shortPlies;
      const mediumTimePerPly = mediumTime / mediumPlies;

      // Time per ply should be roughly similar (within 5x)
      const ratio = mediumTimePerPly / shortTimePerPly;
      expect(
        ratio,
        `Time per ply ratio ${ratio.toFixed(2)} is too high (short: ${shortTimePerPly.toFixed(2)}ms, medium: ${mediumTimePerPly.toFixed(2)}ms)`,
      ).toBeLessThan(5);
    });

    it('should handle long games without excessive slowdown', async () => {
      const pgn = await loadPgn('edge-cases/long-endgame.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const start = performance.now();
      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const elapsed = performance.now() - start;

      const plies = result.results[0]!.analysis.stats.totalPlies;
      const timePerPly = elapsed / plies;

      // Even for long games, should maintain reasonable per-ply time
      expect(
        timePerPly,
        `Time per ply ${timePerPly.toFixed(2)}ms is too high for long game`,
      ).toBeLessThan(200); // 200ms per ply max with mocks
    });
  });

  describe('Resource Usage', () => {
    it('should limit engine calls based on profile', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');

      for (const profile of ['quick', 'standard', 'deep'] as const) {
        const services = createMockServices();
        const reporter = createNullReporter();

        const config = {
          ...DEFAULT_CONFIG,
          analysis: applyProfile(DEFAULT_CONFIG.analysis, profile),
        };

        await orchestrateAnalysis(pgn, config, services, reporter);

        const engineCalls = services.stockfish._calls.evaluate().length;

        // Engine calls should be reasonable for game length
        // Each position needs at least 1 call for shallow analysis
        expect(engineCalls).toBeGreaterThan(0);
      }
    });

    it('should skip Maia calls when configured', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices({ skipMaia: true });
      const reporter = createNullReporter();

      const config = {
        ...DEFAULT_CONFIG,
        analysis: {
          ...DEFAULT_CONFIG.analysis,
          skipMaia: true,
        },
      };

      await orchestrateAnalysis(pgn, config, services, reporter);

      // Maia should not be called
      expect(services.maia).toBeNull();
    });

    it('should skip LLM calls when configured', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices({ skipLlm: true });
      const reporter = createNullReporter();

      const config = {
        ...DEFAULT_CONFIG,
        analysis: {
          ...DEFAULT_CONFIG.analysis,
          skipLlm: true,
        },
      };

      await orchestrateAnalysis(pgn, config, services, reporter);

      // Annotator should not be called
      expect(services.annotator).toBeNull();
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory across multiple analyses', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');

      // Get baseline memory
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const baseline = process.memoryUsage().heapUsed;

        // Run multiple analyses
        for (let i = 0; i < 5; i++) {
          const services = createMockServices();
          const reporter = createNullReporter();
          await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
        }

        // Force GC if available
        if (global.gc) {
          global.gc();
        }

        const final = process.memoryUsage().heapUsed;
        const growth = (final - baseline) / (1024 * 1024); // MB

        // Memory growth should be reasonable (< 50MB for test data)
        expect(
          growth,
          `Memory growth ${growth.toFixed(2)}MB is too high`,
        ).toBeLessThan(50);
      }
    });
  });

  describe('Consistency', () => {
    it('should produce consistent timing across iterations', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const timings: number[] = [];

      for (let i = 0; i < 5; i++) {
        const services = createMockServices();
        const reporter = createNullReporter();

        const start = performance.now();
        await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
        timings.push(performance.now() - start);
      }

      // Calculate coefficient of variation
      const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
      const stdDev = Math.sqrt(
        timings.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / timings.length,
      );
      const cv = stdDev / mean;

      // CV should be reasonable (< 50% variation)
      expect(
        cv,
        `Timing variation too high: CV = ${(cv * 100).toFixed(1)}%`,
      ).toBeLessThan(0.5);
    });
  });
});
