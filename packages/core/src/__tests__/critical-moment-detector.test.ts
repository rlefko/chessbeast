import { describe, it, expect } from 'vitest';

import {
  estimateGamePhase,
  detectPhaseTransitions,
  detectCriticalMoments,
  type PlyEvaluation,
} from '../classifier/critical-moment-detector.js';
import type { EngineEvaluation } from '../types/analysis.js';

describe('Critical Moment Detector', () => {
  describe('estimateGamePhase', () => {
    it('should return opening for early moves', () => {
      expect(estimateGamePhase(0, 80)).toBe('opening');
      expect(estimateGamePhase(10, 80)).toBe('opening');
      expect(estimateGamePhase(20, 80)).toBe('opening');
    });

    it('should return middlegame for middle of game', () => {
      expect(estimateGamePhase(40, 80)).toBe('middlegame');
      expect(estimateGamePhase(50, 80)).toBe('middlegame');
    });

    it('should return endgame for late moves', () => {
      expect(estimateGamePhase(85, 100)).toBe('endgame');
      expect(estimateGamePhase(90, 100)).toBe('endgame');
    });

    it('should handle short games (stay in opening for short games)', () => {
      // In a 20-ply game, the absolute ply count dominates
      // Since plyIndex < 30, it stays in opening phase
      expect(estimateGamePhase(5, 20)).toBe('opening');
      expect(estimateGamePhase(18, 20)).toBe('opening');
    });
  });

  describe('detectPhaseTransitions', () => {
    function createPly(plyIndex: number, cp: number = 0): PlyEvaluation {
      const eval_: EngineEvaluation = { cp, depth: 20, pv: ['e4'] };
      return {
        plyIndex,
        moveNumber: Math.floor(plyIndex / 2) + 1,
        isWhiteMove: plyIndex % 2 === 0,
        evalBefore: eval_,
        evalAfter: { ...eval_, cp: -cp },
        classification: 'good',
        cpLoss: 0,
      };
    }

    it('should detect transition from opening to middlegame', () => {
      // Create a 100-ply game
      const plies = Array.from({ length: 100 }, (_, i) => createPly(i));
      const transitions = detectPhaseTransitions(plies);

      // Should have opening -> middlegame transition around move 15-20
      const toMiddlegame = transitions.find((t) => t.phase === 'middlegame');
      expect(toMiddlegame).toBeDefined();
      expect(toMiddlegame!.plyIndex).toBeLessThan(40);
    });

    it('should detect transition to endgame', () => {
      const plies = Array.from({ length: 100 }, (_, i) => createPly(i));
      const transitions = detectPhaseTransitions(plies);

      const toEndgame = transitions.find((t) => t.phase === 'endgame');
      expect(toEndgame).toBeDefined();
    });

    it('should return empty for very short games', () => {
      const plies = Array.from({ length: 10 }, (_, i) => createPly(i));
      const transitions = detectPhaseTransitions(plies);

      // Very short game stays in opening
      expect(transitions.length).toBe(0);
    });
  });

  describe('detectCriticalMoments', () => {
    function createPlyWithEval(
      plyIndex: number,
      cpBefore: number,
      cpAfter: number,
      classification:
        | 'excellent'
        | 'good'
        | 'inaccuracy'
        | 'mistake'
        | 'blunder'
        | 'brilliant' = 'good',
    ): PlyEvaluation {
      return {
        plyIndex,
        moveNumber: Math.floor(plyIndex / 2) + 1,
        isWhiteMove: plyIndex % 2 === 0,
        evalBefore: { cp: cpBefore, depth: 20, pv: ['e4'] },
        evalAfter: { cp: cpAfter, depth: 20, pv: ['e5'] },
        classification,
        cpLoss: Math.max(0, cpBefore - -cpAfter),
      };
    }

    it('should detect blunders as critical moments', () => {
      const plies: PlyEvaluation[] = [
        createPlyWithEval(0, 0, 0),
        createPlyWithEval(1, 0, 0),
        createPlyWithEval(2, 50, 400, 'blunder'), // Blunder!
        createPlyWithEval(3, -400, -400),
      ];

      const moments = detectCriticalMoments(plies);
      expect(moments.some((m) => m.plyIndex === 2)).toBe(true);
    });

    it('should detect brilliant moves as critical moments', () => {
      const plies: PlyEvaluation[] = [
        createPlyWithEval(0, 0, 0),
        createPlyWithEval(1, 0, -200, 'brilliant'), // Brilliant!
        createPlyWithEval(2, 200, 200),
      ];

      const moments = detectCriticalMoments(plies);
      expect(moments.some((m) => m.plyIndex === 1)).toBe(true);
    });

    it('should detect large evaluation swings', () => {
      const plies: PlyEvaluation[] = [
        createPlyWithEval(0, 0, -50),
        createPlyWithEval(1, 50, 350), // Large swing!
        createPlyWithEval(2, -350, -350),
      ];

      const moments = detectCriticalMoments(plies);
      expect(moments.some((m) => m.plyIndex === 1)).toBe(true);
    });

    it('should cap critical moments at maxCriticalRatio', () => {
      // Create many "interesting" positions
      const plies: PlyEvaluation[] = Array.from({ length: 40 }, (_, i) =>
        createPlyWithEval(i, i * 10, (i + 1) * 10, 'mistake'),
      );

      const moments = detectCriticalMoments(plies, { maxCriticalRatio: 0.25 });
      expect(moments.length).toBeLessThanOrEqual(10); // 25% of 40
    });

    it('should filter by minimum score', () => {
      const plies: PlyEvaluation[] = [
        createPlyWithEval(0, 0, 0), // Not interesting
        createPlyWithEval(1, 0, 0), // Not interesting
        createPlyWithEval(2, 50, 400, 'blunder'), // Very interesting
      ];

      const moments = detectCriticalMoments(plies, { minScore: 50 });
      // Only the blunder should be included
      expect(moments.length).toBe(1);
      expect(moments[0]!.plyIndex).toBe(2);
    });

    it('should return moments in chronological order', () => {
      const plies: PlyEvaluation[] = [
        createPlyWithEval(0, 50, 300, 'blunder'), // Critical
        createPlyWithEval(1, -300, -300),
        createPlyWithEval(2, 300, 100), // Critical
        createPlyWithEval(3, -100, -400, 'blunder'), // Critical
      ];

      const moments = detectCriticalMoments(plies);
      for (let i = 1; i < moments.length; i++) {
        expect(moments[i]!.plyIndex).toBeGreaterThan(moments[i - 1]!.plyIndex);
      }
    });

    it('should include reason for each critical moment', () => {
      const plies: PlyEvaluation[] = [
        createPlyWithEval(0, 0, 0),
        createPlyWithEval(1, 0, 500, 'blunder'),
      ];

      const moments = detectCriticalMoments(plies);
      expect(moments.length).toBeGreaterThan(0);
      expect(moments[0]!.reason).toBeTruthy();
      expect(moments[0]!.reason.length).toBeGreaterThan(0);
    });
  });
});
