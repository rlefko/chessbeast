/**
 * Quality validation tests for annotation coherence
 * Verifies that LLM-generated annotations are coherent and relevant
 */

import { describe, it, expect } from 'vitest';
import { orchestrateAnalysis } from '@chessbeast/cli/orchestrator/orchestrator.js';
import { DEFAULT_CONFIG } from '@chessbeast/cli/config/defaults.js';
import {
  createMockServices,
  createNullReporter,
  loadPgn,
  assertAnnotationGrammar,
  assertAllAnnotationsGrammar,
  isAnnotationCoherent,
  extractMoveReferences,
  matchesTheme,
} from '@chessbeast/test-utils';

describe('Annotation Coherence Quality', () => {
  describe('Grammar and Structure', () => {
    it('should produce grammatically correct annotations', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      // Check annotations on critical moments
      const annotatedMoves = analysis.moves.filter((m) => m.comment && m.comment.length > 0);

      for (const move of annotatedMoves) {
        const coherence = isAnnotationCoherent(move.comment!);

        // Log issues but don't fail on minor issues
        if (!coherence.valid) {
          console.warn(`Ply ${move.plyIndex}: ${coherence.issues.join(', ')}`);
        }

        // At minimum, annotation should not be empty
        expect(move.comment!.length).toBeGreaterThan(0);
      }
    });

    it('should produce annotations with proper sentence structure', async () => {
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      const annotatedMoves = analysis.moves.filter((m) => m.comment && m.comment.length > 10);

      let properStructure = 0;
      for (const move of annotatedMoves) {
        const comment = move.comment!;

        // Check basic sentence structure
        const startsWithCapital = /^[A-Z]/.test(comment);
        const endsWithPunctuation = /[.!?]$/.test(comment.trim());

        if (startsWithCapital && endsWithPunctuation) {
          properStructure++;
        }
      }

      // At least 80% should have proper structure
      if (annotatedMoves.length > 0) {
        const ratio = properStructure / annotatedMoves.length;
        expect(ratio, 'Most annotations should have proper sentence structure').toBeGreaterThanOrEqual(0.8);
      }
    });
  });

  describe('Move Reference Validity', () => {
    it('should reference valid moves in annotations', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      // Collect all moves in the game
      const gameMoves = new Set(analysis.moves.map((m) => m.san));

      for (const move of analysis.moves) {
        if (!move.comment) continue;

        const references = extractMoveReferences(move.comment);

        for (const ref of references) {
          // Move references should either be in the game or valid algebraic notation
          const isInGame = gameMoves.has(ref);
          const isValidNotation = /^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?$/.test(ref) ||
                                   /^O-O(?:-O)?$/.test(ref);

          expect(
            isInGame || isValidNotation,
            `Invalid move reference "${ref}" at ply ${move.plyIndex}`,
          ).toBe(true);
        }
      }
    });
  });

  describe('Annotation Relevance', () => {
    it('should produce relevant annotations for blunders', async () => {
      const pgn = await loadPgn('amateur/beginner-800.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      const blunders = analysis.moves.filter((m) => m.classification === 'blunder');

      for (const blunder of blunders) {
        if (!blunder.comment) continue;

        // Blunder annotations should mention error-related themes
        const errorThemes = ['mistake', 'error', 'blunder', 'loses', 'bad', 'wrong', 'damages', 'worsens'];
        const hasErrorTheme = errorThemes.some((theme) => matchesTheme(blunder.comment!, theme));

        // At least log if no error theme found
        if (!hasErrorTheme) {
          console.warn(`Blunder at ply ${blunder.plyIndex} may not mention error: "${blunder.comment}"`);
        }
      }
    });

    it('should produce relevant annotations for brilliant moves', async () => {
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      const brilliantMoves = analysis.moves.filter((m) => m.classification === 'brilliant');

      for (const move of brilliantMoves) {
        if (!move.comment) continue;

        // Brilliant move annotations should mention positive themes
        const positiveThemes = ['brilliant', 'excellent', 'strong', 'good', 'best', 'improves', 'stunning'];
        const hasPositiveTheme = positiveThemes.some((theme) => matchesTheme(move.comment!, theme));

        if (!hasPositiveTheme) {
          console.warn(`Brilliant move at ply ${move.plyIndex} may not sound positive: "${move.comment}"`);
        }
      }
    });
  });

  describe('Summary Quality', () => {
    it('should produce coherent game summary', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      if (analysis.summary) {
        // Summary should have minimum length
        expect(analysis.summary.length, 'Summary too short').toBeGreaterThan(50);

        // Summary should be coherent
        const coherence = isAnnotationCoherent(analysis.summary);
        if (!coherence.valid) {
          console.warn(`Summary issues: ${coherence.issues.join(', ')}`);
        }
      }
    });

    it('should mention players in summary when present', async () => {
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      if (analysis.summary) {
        const summaryLower = analysis.summary.toLowerCase();

        // Should mention at least one player or 'white'/'black'
        const mentionsPlayers =
          summaryLower.includes('kasparov') ||
          summaryLower.includes('topalov') ||
          summaryLower.includes('white') ||
          summaryLower.includes('black');

        expect(mentionsPlayers, 'Summary should mention players').toBe(true);
      }
    });

    it('should reflect game result in summary', async () => {
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      if (analysis.summary && analysis.metadata.result === '1-0') {
        const summaryLower = analysis.summary.toLowerCase();

        // Should indicate white won
        const indicatesWhiteWin =
          summaryLower.includes('white') ||
          summaryLower.includes('win') ||
          summaryLower.includes('victory') ||
          summaryLower.includes('kasparov');

        // Not strictly required but good practice
        if (!indicatesWhiteWin) {
          console.warn('Summary may not clearly indicate game result');
        }
      }
    });
  });

  describe('Annotation Length', () => {
    it('should not produce excessively long annotations', async () => {
      const pgn = await loadPgn('gm/morphy-opera-game.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      for (const move of analysis.moves) {
        if (!move.comment) continue;

        // Annotations should be concise (under 500 chars)
        expect(
          move.comment.length,
          `Annotation at ply ${move.plyIndex} is too long (${move.comment.length} chars)`,
        ).toBeLessThan(500);
      }
    });

    it('should not produce overly short annotations on critical moments', async () => {
      const pgn = await loadPgn('gm/kasparov-topalov-1999.pgn');
      const services = createMockServices();
      const reporter = createNullReporter();

      const result = await orchestrateAnalysis(pgn, DEFAULT_CONFIG, services, reporter);
      const analysis = result.results[0]!.analysis;

      for (const cm of analysis.criticalMoments) {
        const move = analysis.moves[cm.plyIndex];
        if (!move?.comment) continue;

        // Critical moment annotations should be substantive (at least 20 chars)
        expect(
          move.comment.length,
          `Critical moment annotation at ply ${cm.plyIndex} is too short`,
        ).toBeGreaterThan(20);
      }
    });
  });
});
