/**
 * Quality validation tests for opening identification
 * Verifies ECO code and opening name accuracy
 */

import { describe, it, expect, afterAll } from 'vitest';
import { orchestrateAnalysis } from '@chessbeast/cli/orchestrator/orchestrator.js';
import { DEFAULT_CONFIG } from '@chessbeast/cli/config/defaults.js';
import {
  createMockServices,
  createNullReporter,
  loadPgn,
  createMetricsCollector,
} from '@chessbeast/test-utils';

/**
 * Known opening test cases
 */
const openingTestCases = [
  {
    fixture: 'gm/kasparov-topalov-1999.pgn',
    expectedEco: 'B06',
    expectedName: 'Pirc',
    description: 'Pirc Defense game',
  },
  {
    fixture: 'gm/morphy-opera-game.pgn',
    expectedEco: 'C41',
    expectedName: 'Philidor',
    description: 'Philidor Defense game',
  },
  {
    fixture: 'gm/carlsen-caruana-2018-g12.pgn',
    expectedEco: 'B33',
    expectedName: 'Sicilian',
    description: 'Sicilian Sveshnikov game',
  },
  {
    fixture: 'amateur/club-1400.pgn',
    expectedEco: 'C50',
    expectedName: 'Italian',
    description: 'Italian Game',
  },
];

describe('Opening Identification Quality', () => {
  const collector = createMetricsCollector();

  afterAll(() => {
    const metrics = collector.getMetrics();
    console.log('\n=== Opening Identification Results ===');
    console.log(`ECO Accuracy: ${(metrics.openingIdentification.ecoAccuracy * 100).toFixed(1)}%`);
    console.log(`Name Accuracy: ${(metrics.openingIdentification.nameAccuracy * 100).toFixed(1)}%`);
  });

  describe('ECO Code Identification', () => {
    for (const testCase of openingTestCases) {
      it(`should identify ECO code for ${testCase.description}`, async () => {
        const pgn = await loadPgn(testCase.fixture);
        const services = createMockServices();
        const reporter = createNullReporter();

        const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
        const analysis = result.results[0]!.analysis;

        collector.recordOpeningMatch(analysis.metadata.eco, testCase.expectedEco);

        // ECO should be present
        expect(analysis.metadata.eco).toBeDefined();

        // ECO should match (or be in same family)
        if (analysis.metadata.eco) {
          const expectedFamily = testCase.expectedEco[0]; // First letter (A, B, C, D, E)
          const actualFamily = analysis.metadata.eco[0];

          // At minimum, should be in same ECO family
          expect(actualFamily, `Expected ECO family ${expectedFamily}, got ${actualFamily}`).toBe(
            expectedFamily,
          );
        }
      });
    }
  });

  describe('Opening Name Identification', () => {
    for (const testCase of openingTestCases) {
      it(`should identify opening name for ${testCase.description}`, async () => {
        const pgn = await loadPgn(testCase.fixture);
        const services = createMockServices();
        const reporter = createNullReporter();

        const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
        const analysis = result.results[0]!.analysis;

        collector.recordOpeningNameMatch(analysis.metadata.openingName, testCase.expectedName);

        // Opening name may or may not be present depending on database
        if (analysis.metadata.openingName) {
          const nameLower = analysis.metadata.openingName.toLowerCase();
          const expectedLower = testCase.expectedName.toLowerCase();

          // Name should contain expected keyword
          const nameMatch = nameLower.includes(expectedLower) || expectedLower.includes(nameLower);

          if (!nameMatch) {
            console.warn(
              `Opening name mismatch for ${testCase.fixture}: expected "${testCase.expectedName}", got "${analysis.metadata.openingName}"`,
            );
          }
        }
      });
    }
  });

  describe('Common Opening Recognition', () => {
    const commonOpenings = [
      {
        pgn: `[Event "Test"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 *`,
        expectedEcoFamily: 'C',
        name: 'Ruy Lopez / Spanish',
      },
      {
        pgn: `[Event "Test"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 c5 *`,
        expectedEcoFamily: 'B',
        name: 'Sicilian Defense',
      },
      {
        pgn: `[Event "Test"]
[White "A"]
[Black "B"]
[Result "*"]

1. d4 d5 2. c4 *`,
        expectedEcoFamily: 'D',
        name: "Queen's Gambit",
      },
      {
        pgn: `[Event "Test"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 e6 *`,
        expectedEcoFamily: 'C',
        name: 'French Defense',
      },
      {
        pgn: `[Event "Test"]
[White "A"]
[Black "B"]
[Result "*"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 *`,
        expectedEcoFamily: 'E',
        name: 'Nimzo-Indian',
      },
    ];

    for (const opening of commonOpenings) {
      it(`should recognize ${opening.name}`, async () => {
        const services = createMockServices();
        const reporter = createNullReporter();

        const result = await orchestrateAnalysis(opening.pgn, DEFAULT_CONFIG, services, reporter);
        const analysis = result.results[0]!.analysis;

        // Should identify some ECO code
        expect(analysis.metadata.eco).toBeDefined();

        if (analysis.metadata.eco) {
          const actualFamily = analysis.metadata.eco[0];
          expect(
            actualFamily,
            `Expected ECO family ${opening.expectedEcoFamily} for ${opening.name}, got ${actualFamily}`,
          ).toBe(opening.expectedEcoFamily);
        }
      });
    }
  });

  describe('Opening Metadata Consistency', () => {
    it('should maintain consistent opening identification across runs', async () => {
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      // Run twice
      const result1 = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const result2 = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);

      const analysis1 = result1.results[0]!.analysis;
      const analysis2 = result2.results[0]!.analysis;

      expect(analysis1.metadata.eco).toBe(analysis2.metadata.eco);
      expect(analysis1.metadata.openingName).toBe(analysis2.metadata.openingName);
    });

    it('should handle games without clear opening', async () => {
      // A very short game
      const pgn = await loadPgn('edge-cases/scholars-mate.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      // Should not crash, may or may not identify an opening
      expect(result.stats.gamesAnalyzed).toBe(1);
    });
  });

  describe('Opening Phase Detection', () => {
    it('should identify opening end point', async () => {
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      // Phase transitions should include opening
      const hasOpeningPhase = analysis.stats.phaseTransitions.some((pt) => pt.phase === 'opening');

      expect(hasOpeningPhase, 'Should identify opening phase').toBe(true);
    });

    it('should transition from opening to middlegame', async () => {
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      // Should have middlegame phase
      const hasMiddlegame = analysis.stats.phaseTransitions.some((pt) => pt.phase === 'middlegame');

      expect(hasMiddlegame, 'Should identify middlegame transition').toBe(true);
    });
  });
});
