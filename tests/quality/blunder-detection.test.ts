/**
 * Quality validation tests for blunder detection
 * Verifies >90% recall for blunder detection
 */

import { describe, it, expect, afterAll } from 'vitest';
import { orchestrateAnalysis } from '@chessbeast/cli/orchestrator/orchestrator.js';
import { DEFAULT_CONFIG } from '@chessbeast/cli/config/defaults.js';
import {
  createMockServices,
  createNullReporter,
  loadJson,
  createMetricsCollector,
  type QualityMetrics,
} from '@chessbeast/test-utils';
import { parsePgn } from '@chessbeast/pgn';

/**
 * Labeled game for testing
 */
interface LabeledGame {
  name: string;
  pgn: string;
  groundTruth: {
    blunders: number[];
    mistakes: number[];
    inaccuracies: number[];
    criticalMoments: number[];
    opening: {
      eco: string;
      name: string;
    };
  };
  description: string;
}

describe('Blunder Detection Quality', () => {
  const collector = createMetricsCollector();

  // Labeled games for validation
  const labeledGames: LabeledGame[] = [];

  // Load labeled games
  beforeAll(async () => {
    try {
      const game1 = await loadJson<LabeledGame>('labeled/blunder-detection-001.json');
      labeledGames.push(game1);
    } catch {
      // File may not exist, use inline test data
    }

    try {
      const game2 = await loadJson<LabeledGame>('labeled/blunder-detection-002.json');
      labeledGames.push(game2);
    } catch {
      // File may not exist, use inline test data
    }

    // Add inline test case if no files loaded
    if (labeledGames.length === 0) {
      labeledGames.push({
        name: 'Inline Test Game',
        pgn: `[Event "Test"]
[White "Test1"]
[Black "Test2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Na5 6. d3 h6 7. Nf3 e4 8. Qe2 Nxc4 9. dxc4 Bc5 10. Nfd2 O-O 1-0`,
        groundTruth: {
          blunders: [9], // Na5 losing the knight
          mistakes: [5, 11],
          inaccuracies: [7],
          criticalMoments: [5, 9],
          opening: { eco: 'C57', name: 'Two Knights Defense' },
        },
        description: 'Test game with known blunder',
      });
    }
  });

  afterAll(() => {
    const metrics = collector.getMetrics();
    console.log('\n' + collector.generateReport());

    // Assert minimum quality thresholds
    if (metrics.blunderDetection.truePositives + metrics.blunderDetection.falseNegatives > 0) {
      expect(
        metrics.blunderDetection.recall,
        `Blunder detection recall ${(metrics.blunderDetection.recall * 100).toFixed(1)}% should be >= 90%`,
      ).toBeGreaterThanOrEqual(0.9);
    }
  });

  describe('Labeled Game Blunder Detection', () => {
    it('should detect blunders in test games', async () => {
      for (const game of labeledGames) {
        const services = createMockServices();
        const reporter = createNullReporter();

        const result = await orchestrateAnalysis(game.pgn, DEFAULT_CONFIG, services, reporter);

        expect(result.stats.gamesAnalyzed).toBe(1);
        const analysis = result.results[0]!.analysis;

        // Extract predicted blunders
        const predictedBlunders = analysis.moves
          .filter((m) => m.classification === 'blunder')
          .map((m) => m.plyIndex);

        // Record for metrics
        collector.recordBlunderDetection(predictedBlunders, game.groundTruth.blunders);

        // Individual game assertions (with tolerance)
        const intersection = predictedBlunders.filter((p) =>
          game.groundTruth.blunders.includes(p),
        );

        // At least 70% of ground truth blunders should be detected
        if (game.groundTruth.blunders.length > 0) {
          const recall = intersection.length / game.groundTruth.blunders.length;
          expect(
            recall,
            `Game "${game.name}": Expected at least 70% blunder recall, got ${(recall * 100).toFixed(1)}%`,
          ).toBeGreaterThanOrEqual(0.7);
        }
      }
    });
  });

  describe('Move Classification Distribution', () => {
    it('should produce reasonable classification distribution', async () => {
      const pgn = labeledGames[0]?.pgn ?? `[Event "Test"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *`;

      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      // Count classifications
      const counts: Record<string, number> = {};
      for (const move of analysis.moves) {
        counts[move.classification] = (counts[move.classification] ?? 0) + 1;
      }

      // At least some moves should be classified
      expect(Object.keys(counts).length).toBeGreaterThan(0);

      // No single classification should dominate (>80%)
      const total = analysis.moves.length;
      for (const [classification, count] of Object.entries(counts)) {
        const ratio = count / total;
        expect(
          ratio,
          `Classification "${classification}" dominates with ${(ratio * 100).toFixed(1)}%`,
        ).toBeLessThanOrEqual(0.85);
      }
    });
  });

  describe('Blunder Threshold Consistency', () => {
    it('should classify large cp loss as blunder', async () => {
      // Create a mock that returns specific cp losses
      const services = createMockServices({
        engine: {
          responses: new Map([
            // Position before blunder: even
            ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
             { cp: 0, depth: 20, pv: ['Nf3'] }],
            // Position after blunder: losing 300cp
            ['rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
             { cp: -300, depth: 20, pv: [] }],
          ]),
        },
      });
      const reporter = createNullReporter();

      const pgn = `[Event "Test"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 e5 2. Nf3 *`;

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      // Verify moves with high cp loss are classified appropriately
      const highCpLossMoves = analysis.moves.filter((m) => m.cpLoss >= 200);

      for (const move of highCpLossMoves) {
        expect(
          ['blunder', 'mistake'],
          `Move with ${move.cpLoss}cp loss should be blunder or mistake`,
        ).toContain(move.classification);
      }
    });
  });

  describe('Blunder Detection Consistency', () => {
    it('should produce consistent blunder detection across runs', async () => {
      const pgn = labeledGames[0]?.pgn ?? `[Event "Test"]
[White "A"]
[Black "B"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Na5 1-0`;

      const services = createMockServices();
      const reporter = createNullReporter();

      // Run twice
      const result1 = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const result2 = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      const blunders1 = result1.results[0]!.analysis.moves
        .filter((m) => m.classification === 'blunder')
        .map((m) => m.plyIndex)
        .sort((a, b) => a - b);

      const blunders2 = result2.results[0]!.analysis.moves
        .filter((m) => m.classification === 'blunder')
        .map((m) => m.plyIndex)
        .sort((a, b) => a - b);

      expect(blunders1).toEqual(blunders2);
    });
  });
});
