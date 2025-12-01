/**
 * Tests for candidate move classifier
 */

import { describe, it, expect } from 'vitest';

import {
  classifyCandidates,
  getDefaultConfig,
  isCheck,
  isCapture,
  getPieceType,
  isAttractiveBad,
  getPrimarySource,
  generateSourceReason,
  type EngineCandidate,
  type MaiaPrediction,
} from '../explorer/candidate-classifier.js';
import { CANDIDATE_SOURCE_PRIORITY, type CandidateSource } from '../explorer/types.js';

describe('Candidate Classifier', () => {
  describe('isCheck', () => {
    it('should detect check moves', () => {
      expect(isCheck('Qh7+')).toBe(true);
      expect(isCheck('Bxf7+')).toBe(true);
      expect(isCheck('Nf3#')).toBe(true);
    });

    it('should not detect non-check moves', () => {
      expect(isCheck('e4')).toBe(false);
      expect(isCheck('Nf3')).toBe(false);
      expect(isCheck('Bxf7')).toBe(false);
    });
  });

  describe('isCapture', () => {
    it('should detect capture moves', () => {
      expect(isCapture('Bxf7')).toBe(true);
      expect(isCapture('Qxh7+')).toBe(true);
      expect(isCapture('exd5')).toBe(true);
    });

    it('should not detect non-capture moves', () => {
      expect(isCapture('e4')).toBe(false);
      expect(isCapture('Nf3')).toBe(false);
      expect(isCapture('O-O')).toBe(false);
    });
  });

  describe('getPieceType', () => {
    it('should identify knight moves', () => {
      expect(getPieceType('Nf3')).toBe('n');
      expect(getPieceType('Nxe5')).toBe('n');
    });

    it('should identify bishop moves', () => {
      expect(getPieceType('Bc4')).toBe('b');
      expect(getPieceType('Bxf7+')).toBe('b');
    });

    it('should identify rook moves', () => {
      expect(getPieceType('Re1')).toBe('r');
      expect(getPieceType('Rxe4')).toBe('r');
    });

    it('should identify queen moves', () => {
      expect(getPieceType('Qd5')).toBe('q');
      expect(getPieceType('Qxh7#')).toBe('q');
    });

    it('should identify king moves', () => {
      expect(getPieceType('Ke2')).toBe('k');
      expect(getPieceType('Kxf7')).toBe('k');
    });

    it('should identify pawn moves', () => {
      expect(getPieceType('e4')).toBe('p');
      expect(getPieceType('exd5')).toBe('p');
      expect(getPieceType('a6')).toBe('p');
    });

    it('should identify castling as king moves', () => {
      expect(getPieceType('O-O')).toBe('k');
      expect(getPieceType('O-O-O')).toBe('k');
    });
  });

  describe('isAttractiveBad', () => {
    it('should identify attractive but bad moves at 1500 rating', () => {
      const config = getDefaultConfig(1500);

      // High human prob (20%) and big eval loss (150cp) = attractive but bad
      expect(isAttractiveBad(150, 0.2, config)).toBe(true);

      // High human prob but small eval loss = not bad enough
      expect(isAttractiveBad(50, 0.3, config)).toBe(false);

      // Low human prob = not attractive
      expect(isAttractiveBad(200, 0.05, config)).toBe(false);
    });

    it('should use rating-dependent thresholds', () => {
      // At 1100, needs high probability (>=0.25) and high eval loss (>=150)
      const config1100 = getDefaultConfig(1100);
      expect(isAttractiveBad(150, 0.25, config1100)).toBe(true);
      expect(isAttractiveBad(100, 0.2, config1100)).toBe(false); // not enough prob or eval loss

      // At 1900, thresholds are lower (more sensitive to smaller mistakes)
      // Interpolated: ~0.125 prob, ~67cp eval loss
      const config1900 = getDefaultConfig(1900);
      expect(isAttractiveBad(70, 0.15, config1900)).toBe(true);
      expect(isAttractiveBad(50, 0.1, config1900)).toBe(false); // not enough eval loss
    });

    it('should return false when human probability is undefined', () => {
      const config = getDefaultConfig(1500);
      expect(isAttractiveBad(200, undefined, config)).toBe(false);
    });
  });

  describe('getPrimarySource', () => {
    it('should return highest priority source', () => {
      expect(getPrimarySource(['engine_best', 'scary_check'])).toBe('engine_best');
      expect(getPrimarySource(['near_best', 'maia_preferred'])).toBe('maia_preferred');
      expect(getPrimarySource(['human_popular', 'attractive_but_bad'])).toBe('attractive_but_bad');
    });

    it('should return quiet_improvement as default', () => {
      expect(getPrimarySource([])).toBe('quiet_improvement');
    });

    it('should follow CANDIDATE_SOURCE_PRIORITY order', () => {
      // Test that priority order is respected
      const allSources: CandidateSource[] = [...CANDIDATE_SOURCE_PRIORITY];
      expect(getPrimarySource(allSources)).toBe(CANDIDATE_SOURCE_PRIORITY[0]);
    });
  });

  describe('generateSourceReason', () => {
    it('should generate reason for attractive_but_bad', () => {
      const reason = generateSourceReason(['attractive_but_bad', 'human_popular'], 0.45, 200);
      expect(reason).toContain('tempting');
      expect(reason).toContain('45%');
      expect(reason).toContain('loses');
    });

    it('should generate reason for engine_best', () => {
      const reason = generateSourceReason(['engine_best']);
      expect(reason).toContain("engine's top choice");
    });

    it('should generate reason for maia_preferred', () => {
      const reason = generateSourceReason(['maia_preferred', 'human_popular'], 0.38);
      expect(reason).toContain('human favorite');
      expect(reason).toContain('38%');
    });

    it('should include scary_check', () => {
      const reason = generateSourceReason(['near_best', 'scary_check']);
      expect(reason).toContain('gives check');
    });

    it('should include sacrifice', () => {
      const reason = generateSourceReason(['engine_best', 'sacrifice']);
      expect(reason).toContain('sacrifice');
    });

    it('should include blunder with eval loss', () => {
      const reason = generateSourceReason(['blunder'], undefined, 300);
      expect(reason).toContain('loses 3 pawns');
    });

    it('should return default for quiet_improvement', () => {
      const reason = generateSourceReason(['quiet_improvement']);
      expect(reason).toBe('positional improvement');
    });

    it('should return alternative for empty sources', () => {
      const reason = generateSourceReason([]);
      expect(reason).toBe('alternative');
    });
  });

  describe('classifyCandidates', () => {
    const config = getDefaultConfig(1500);

    it('should classify engine best move', () => {
      const candidates: EngineCandidate[] = [
        { move: 'Nf3', evaluation: 50, isMate: false, pv: ['Nf3', 'd6', 'Bc4'] },
        { move: 'e4', evaluation: 30, isMate: false, pv: ['e4', 'e5', 'Nf3'] },
      ];

      const result = classifyCandidates(candidates, undefined, config);

      expect(result).toHaveLength(2);
      expect(result[0]!.move).toBe('Nf3');
      expect(result[0]!.sources).toContain('engine_best');
      expect(result[0]!.primarySource).toBe('engine_best');
    });

    it('should classify near_best moves', () => {
      const candidates: EngineCandidate[] = [
        { move: 'Nf3', evaluation: 50, isMate: false, pv: ['Nf3', 'd6'] },
        { move: 'Nc3', evaluation: 30, isMate: false, pv: ['Nc3', 'd5'] }, // 20cp off = near_best
        { move: 'e3', evaluation: -100, isMate: false, pv: ['e3', 'd5'] }, // 150cp off = not near_best
      ];

      const result = classifyCandidates(candidates, undefined, config);

      expect(result[1]!.sources).toContain('near_best');
      expect(result[2]!.sources).not.toContain('near_best');
    });

    it('should integrate Maia predictions', () => {
      const candidates: EngineCandidate[] = [
        { move: 'Nf3', evaluation: 50, isMate: false, pv: ['Nf3'] },
        { move: 'e4', evaluation: 40, isMate: false, pv: ['e4'] },
      ];
      const maiaPredictions: MaiaPrediction[] = [
        { san: 'e4', probability: 0.45 },
        { san: 'Nf3', probability: 0.25 },
      ];

      const result = classifyCandidates(candidates, maiaPredictions, config);

      // e4 should have maia_preferred and human_popular
      const e4Result = result.find((r) => r.move === 'e4')!;
      expect(e4Result.sources).toContain('maia_preferred');
      expect(e4Result.sources).toContain('human_popular');
      expect(e4Result.humanProbability).toBe(0.45);

      // Nf3 should have human_popular
      const nf3Result = result.find((r) => r.move === 'Nf3')!;
      expect(nf3Result.sources).toContain('human_popular');
      expect(nf3Result.humanProbability).toBe(0.25);
    });

    it('should detect attractive_but_bad moves', () => {
      const candidates: EngineCandidate[] = [
        { move: 'Nf3', evaluation: 50, isMate: false, pv: ['Nf3'] },
        { move: 'Bxh7+', evaluation: -100, isMate: false, pv: ['Bxh7+', 'Kxh7'] }, // 150cp worse
      ];
      const maiaPredictions: MaiaPrediction[] = [
        { san: 'Bxh7+', probability: 0.35 }, // High probability - attractive
        { san: 'Nf3', probability: 0.15 },
      ];

      const result = classifyCandidates(candidates, maiaPredictions, config);

      const bxh7Result = result.find((r) => r.move === 'Bxh7+')!;
      expect(bxh7Result.sources).toContain('attractive_but_bad');
      expect(bxh7Result.sources).toContain('scary_check');
      expect(bxh7Result.sources).toContain('scary_capture');
    });

    it('should detect blunders', () => {
      const candidates: EngineCandidate[] = [
        { move: 'Nf3', evaluation: 50, isMate: false, pv: ['Nf3'] },
        { move: 'Qh5', evaluation: -200, isMate: false, pv: ['Qh5'] }, // 250cp worse
      ];

      const result = classifyCandidates(candidates, undefined, config);

      const qh5Result = result.find((r) => r.move === 'Qh5')!;
      expect(qh5Result.sources).toContain('blunder');
    });

    it('should detect checks and captures', () => {
      const candidates: EngineCandidate[] = [
        { move: 'Qxf7+', evaluation: 300, isMate: false, pv: ['Qxf7+', 'Kd8'] },
        { move: 'Nxe5', evaluation: 100, isMate: false, pv: ['Nxe5'] },
        { move: 'Bb5+', evaluation: 50, isMate: false, pv: ['Bb5+', 'c6'] },
      ];

      const result = classifyCandidates(candidates, undefined, config);

      expect(result[0]!.sources).toContain('scary_check');
      expect(result[0]!.sources).toContain('scary_capture');
      expect(result[1]!.sources).toContain('scary_capture');
      expect(result[1]!.sources).not.toContain('scary_check');
      expect(result[2]!.sources).toContain('scary_check');
      expect(result[2]!.sources).not.toContain('scary_capture');
    });

    it('should generate line preview', () => {
      const candidates: EngineCandidate[] = [
        { move: 'e4', evaluation: 50, isMate: false, pv: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
      ];

      const result = classifyCandidates(candidates, undefined, config);

      expect(result[0]!.line).toBe('e4 e5 Nf3 Nc6');
    });

    it('should generate source reason', () => {
      const candidates: EngineCandidate[] = [
        { move: 'Nf3', evaluation: 50, isMate: false, pv: ['Nf3'] },
      ];
      const maiaPredictions: MaiaPrediction[] = [{ san: 'Nf3', probability: 0.4 }];

      const result = classifyCandidates(candidates, maiaPredictions, config);

      expect(result[0]!.sourceReason).toBeDefined();
      expect(result[0]!.sourceReason.length).toBeGreaterThan(0);
    });

    it('should return empty array for empty candidates', () => {
      const result = classifyCandidates([], undefined, config);
      expect(result).toHaveLength(0);
    });

    it('should handle mate evaluations', () => {
      const candidates: EngineCandidate[] = [
        { move: 'Qf7#', evaluation: 10000, isMate: true, mateIn: 1, pv: ['Qf7#'] },
      ];

      const result = classifyCandidates(candidates, undefined, config);

      expect(result[0]!.isMate).toBe(true);
      expect(result[0]!.mateIn).toBe(1);
    });
  });

  describe('getDefaultConfig', () => {
    it('should return valid config for different ratings', () => {
      const ratings = [1100, 1300, 1500, 1700, 1900];

      for (const rating of ratings) {
        const config = getDefaultConfig(rating);
        expect(config.targetRating).toBe(rating);
        expect(config.nearBestThreshold).toBe(50);
        expect(config.humanPopularThreshold).toBe(0.15);
        expect(config.blunderThreshold).toBe(200);
        expect(config.attractiveBadThreshold).toBeGreaterThan(0);
      }
    });

    it('should adjust attractiveBadThreshold by rating', () => {
      const config1100 = getDefaultConfig(1100);
      const config1500 = getDefaultConfig(1500);
      const config1900 = getDefaultConfig(1900);

      // Higher ratings should have lower threshold (more sensitive to smaller mistakes)
      // Lower rated players need bigger mistakes to count as "bad"
      expect(config1900.attractiveBadThreshold).toBeLessThanOrEqual(
        config1500.attractiveBadThreshold,
      );
      expect(config1500.attractiveBadThreshold).toBeLessThanOrEqual(
        config1100.attractiveBadThreshold,
      );
    });
  });
});
