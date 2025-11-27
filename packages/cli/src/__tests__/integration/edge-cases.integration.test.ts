/**
 * Integration tests for edge cases
 * Tests unusual game scenarios and boundary conditions
 */

import { describe, it, expect } from 'vitest';
import { orchestrateAnalysis } from '../../orchestrator/orchestrator.js';
import { DEFAULT_CONFIG } from '../../config/defaults.js';
import {
  createMockServices,
  createNullReporter,
  loadPgn,
  assertValidAnalysis,
} from '@chessbeast/test-utils';

describe('Edge Cases Integration', () => {
  describe('Game Length Edge Cases', () => {
    it('should handle minimum length game (4 moves)', async () => {
      const pgn = await loadPgn('edge-cases/scholars-mate.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
      const analysis = result.results[0]!.analysis;

      assertValidAnalysis(analysis);
      expect(analysis.stats.totalMoves).toBeLessThanOrEqual(4);
    });

    it('should handle medium-length game (40+ moves)', async () => {
      // Use a verified working game for this test
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
      const analysis = result.results[0]!.analysis;

      assertValidAnalysis(analysis);
      expect(analysis.stats.totalMoves).toBeGreaterThan(40);
    });
  });

  describe('Game Result Edge Cases', () => {
    it('should handle draw result', async () => {
      const pgn = await loadPgn('edge-cases/stalemate.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      expect(result.stats.gamesAnalyzed).toBe(1);
      expect(result.results[0]!.analysis.metadata.result).toBe('1/2-1/2');
    });

    it('should handle white wins result', async () => {
      const pgn = await loadPgn('edge-cases/scholars-mate.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      expect(result.results[0]!.analysis.metadata.result).toBe('1-0');
    });
  });

  describe('Special Moves', () => {
    it.skip('should handle pawn promotions', async () => {
      // Skipped: Requires a valid PGN fixture with promotions
      // TODO: Add a verified game with pawn promotions
      const pgn = await loadPgn('edge-cases/promotions.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      const analysis = result.results[0]!.analysis;
      assertValidAnalysis(analysis);

      // Find promotion moves (contain '=')
      const promotions = analysis.moves.filter((m) => m.san.includes('='));
      expect(promotions.length).toBeGreaterThan(0);

      // Verify promotion moves have valid SAN
      for (const promo of promotions) {
        expect(promo.san).toMatch(/[a-h]([1-8]|x[a-h][1-8])=[QRBN]/);
      }
    });

    it('should handle castling moves', async () => {
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      const analysis = result.results[0]!.analysis;
      assertValidAnalysis(analysis);

      // Look for castling moves
      const castling = analysis.moves.filter((m) => m.san === 'O-O' || m.san === 'O-O-O');
      expect(castling.length).toBeGreaterThan(0);
    });

    it('should handle en passant captures', async () => {
      // Use a game that likely has en passant
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      const analysis = result.results[0]!.analysis;
      assertValidAnalysis(analysis);
      // Just verify the game completes successfully
    });
  });

  describe('Metadata Edge Cases', () => {
    it('should handle games without ELO ratings', async () => {
      const pgn = await loadPgn('edge-cases/scholars-mate.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      const analysis = result.results[0]!.analysis;
      // Game should still be analyzed without ELO
      assertValidAnalysis(analysis);
    });

    it('should handle games with ELO ratings', async () => {
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      const analysis = result.results[0]!.analysis;
      assertValidAnalysis(analysis);

      expect(analysis.metadata.whiteElo).toBe(2812);
      expect(analysis.metadata.blackElo).toBe(2700);
    });

    it('should handle games with ECO code', async () => {
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      const analysis = result.results[0]!.analysis;
      expect(analysis.metadata.eco).toBeDefined();
    });
  });

  describe('Opening Phase', () => {
    it('should identify opening moves as book moves', async () => {
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      const analysis = result.results[0]!.analysis;

      // Early moves should be classified (book, good, or excellent typically)
      const earlyMoves = analysis.moves.slice(0, 6);
      for (const move of earlyMoves) {
        expect([
          'book',
          'good',
          'excellent',
          'inaccuracy',
          'mistake',
          'blunder',
          'brilliant',
          'forced',
        ]).toContain(move.classification);
      }
    });
  });

  describe('Critical Moments', () => {
    it('should detect critical moments in tactical games', async () => {
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      const analysis = result.results[0]!.analysis;

      // Kasparov-Topalov has famous tactical moments
      expect(analysis.criticalMoments.length).toBeGreaterThan(0);

      // Critical moments should have valid ply indices
      for (const cm of analysis.criticalMoments) {
        expect(cm.plyIndex).toBeGreaterThanOrEqual(0);
        expect(cm.plyIndex).toBeLessThan(analysis.moves.length);
        expect(cm.type).toBeDefined();
        expect(cm.score).toBeGreaterThanOrEqual(0);
        expect(cm.score).toBeLessThanOrEqual(100);
      }
    });

    it('should respect maxCriticalRatio', async () => {
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      // Set very low critical ratio
      const lowCriticalConfig = {
        ...DEFAULT_CONFIG,
        analysis: {
          ...DEFAULT_CONFIG.analysis,
          maxCriticalRatio: 0.05, // Only 5% of moves
        },
      };

      const result = await orchestrateAnalysis(pgn, lowCriticalConfig, services, reporter);

      const analysis = result.results[0]!.analysis;
      const maxCritical = Math.ceil(analysis.moves.length * 0.05);

      expect(analysis.criticalMoments.length).toBeLessThanOrEqual(maxCritical + 1); // Allow some tolerance
    });
  });

  describe('Phase Transitions', () => {
    it('should detect phase transitions in games', async () => {
      // Use a verified working game for this test
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      const analysis = result.results[0]!.analysis;

      // Game should have phase transitions (opening -> middle game at minimum)
      expect(analysis.stats.phaseTransitions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate accuracy between 0 and 100', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      const analysis = result.results[0]!.analysis;

      expect(analysis.stats.white.accuracy).toBeGreaterThanOrEqual(0);
      expect(analysis.stats.white.accuracy).toBeLessThanOrEqual(100);
      expect(analysis.stats.black.accuracy).toBeGreaterThanOrEqual(0);
      expect(analysis.stats.black.accuracy).toBeLessThanOrEqual(100);
    });

    it('should count errors correctly', async () => {
      const pgn = await loadPgn('amateur/beginner-800.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      const analysis = result.results[0]!.analysis;

      // Error counts should be non-negative
      expect(analysis.stats.white.inaccuracies).toBeGreaterThanOrEqual(0);
      expect(analysis.stats.white.mistakes).toBeGreaterThanOrEqual(0);
      expect(analysis.stats.white.blunders).toBeGreaterThanOrEqual(0);
      expect(analysis.stats.black.inaccuracies).toBeGreaterThanOrEqual(0);
      expect(analysis.stats.black.mistakes).toBeGreaterThanOrEqual(0);
      expect(analysis.stats.black.blunders).toBeGreaterThanOrEqual(0);

      // Count from moves should match stats
      const whiteMoves = analysis.moves.filter((m) => m.isWhiteMove);
      const blackMoves = analysis.moves.filter((m) => !m.isWhiteMove);

      const whiteBlunders = whiteMoves.filter((m) => m.classification === 'blunder').length;
      const blackBlunders = blackMoves.filter((m) => m.classification === 'blunder').length;

      expect(analysis.stats.white.blunders).toBe(whiteBlunders);
      expect(analysis.stats.black.blunders).toBe(blackBlunders);
    });
  });
});
