/**
 * Fluent builder for GameAnalysis test data
 */

import type {
  GameAnalysis,
  MoveAnalysis,
  CriticalMoment,
  CriticalMomentType,
  GameStats,
  PlayerStats,
  GamePhase,
} from '@chessbeast/core';

/**
 * Default player stats
 */
function defaultPlayerStats(): PlayerStats {
  return {
    averageCpLoss: 30,
    inaccuracies: 2,
    mistakes: 1,
    blunders: 0,
    excellentMoves: 3,
    brilliantMoves: 0,
    accuracy: 85,
  };
}

/**
 * Default game stats
 */
function defaultGameStats(): GameStats {
  return {
    totalMoves: 30,
    totalPlies: 60,
    white: defaultPlayerStats(),
    black: defaultPlayerStats(),
    phaseTransitions: [{ toPly: 0, phase: 'opening' as GamePhase }],
  };
}

/**
 * Default game metadata
 */
function defaultMetadata(): GameAnalysis['metadata'] {
  return {
    white: 'Player1',
    black: 'Player2',
    result: '1-0',
    event: 'Test Game',
  };
}

/**
 * Fluent builder for creating GameAnalysis instances
 */
export class GameAnalysisBuilder {
  private analysis: GameAnalysis;

  constructor() {
    this.analysis = {
      metadata: defaultMetadata(),
      moves: [],
      criticalMoments: [],
      stats: defaultGameStats(),
    };
  }

  /**
   * Set game metadata
   */
  withMetadata(meta: Partial<GameAnalysis['metadata']>): this {
    this.analysis.metadata = { ...this.analysis.metadata, ...meta };
    return this;
  }

  /**
   * Set white player name
   */
  withWhite(name: string, elo?: number): this {
    this.analysis.metadata.white = name;
    if (elo !== undefined) {
      this.analysis.metadata.whiteElo = elo;
    }
    return this;
  }

  /**
   * Set black player name
   */
  withBlack(name: string, elo?: number): this {
    this.analysis.metadata.black = name;
    if (elo !== undefined) {
      this.analysis.metadata.blackElo = elo;
    }
    return this;
  }

  /**
   * Set game result
   */
  withResult(result: string): this {
    this.analysis.metadata.result = result;
    return this;
  }

  /**
   * Set opening info
   */
  withOpening(eco: string, name?: string): this {
    this.analysis.metadata.eco = eco;
    if (name) {
      this.analysis.metadata.openingName = name;
    }
    return this;
  }

  /**
   * Set all moves
   */
  withMoves(moves: MoveAnalysis[]): this {
    this.analysis.moves = moves;
    this.recalculateStats();
    return this;
  }

  /**
   * Add a single move
   */
  addMove(move: MoveAnalysis): this {
    this.analysis.moves.push(move);
    this.recalculateStats();
    return this;
  }

  /**
   * Add a blunder at a specific ply index
   */
  withBlunderAt(plyIndex: number, cpLoss: number = 300): this {
    const move = this.analysis.moves[plyIndex];
    if (move) {
      move.classification = 'blunder';
      move.cpLoss = cpLoss;
      move.isCriticalMoment = true;
    }
    this.recalculateStats();
    return this;
  }

  /**
   * Add a mistake at a specific ply index
   */
  withMistakeAt(plyIndex: number, cpLoss: number = 150): this {
    const move = this.analysis.moves[plyIndex];
    if (move) {
      move.classification = 'mistake';
      move.cpLoss = cpLoss;
      move.isCriticalMoment = true;
    }
    this.recalculateStats();
    return this;
  }

  /**
   * Add all critical moments
   */
  withCriticalMoments(moments: CriticalMoment[]): this {
    this.analysis.criticalMoments = moments;
    // Mark corresponding moves as critical
    for (const moment of moments) {
      const move = this.analysis.moves[moment.plyIndex];
      if (move) {
        move.isCriticalMoment = true;
      }
    }
    return this;
  }

  /**
   * Add a critical moment at a specific ply index
   */
  withCriticalMomentAt(
    plyIndex: number,
    type: CriticalMomentType,
    score: number = 50,
    reason: string = 'Test critical moment',
  ): this {
    this.analysis.criticalMoments.push({ plyIndex, type, score, reason });
    const move = this.analysis.moves[plyIndex];
    if (move) {
      move.isCriticalMoment = true;
    }
    return this;
  }

  /**
   * Set game stats directly
   */
  withStats(stats: Partial<GameStats>): this {
    this.analysis.stats = { ...this.analysis.stats, ...stats };
    return this;
  }

  /**
   * Set white player stats
   */
  withWhiteStats(stats: Partial<PlayerStats>): this {
    this.analysis.stats.white = { ...this.analysis.stats.white, ...stats };
    return this;
  }

  /**
   * Set black player stats
   */
  withBlackStats(stats: Partial<PlayerStats>): this {
    this.analysis.stats.black = { ...this.analysis.stats.black, ...stats };
    return this;
  }

  /**
   * Set game summary
   */
  withSummary(summary: string): this {
    this.analysis.summary = summary;
    return this;
  }

  /**
   * Add phase transition
   */
  withPhaseTransition(toPly: number, phase: GamePhase): this {
    this.analysis.stats.phaseTransitions.push({ toPly, phase });
    return this;
  }

  /**
   * Recalculate stats based on current moves
   */
  private recalculateStats(): void {
    const whiteMoves = this.analysis.moves.filter((m) => m.isWhiteMove);
    const blackMoves = this.analysis.moves.filter((m) => !m.isWhiteMove);

    this.analysis.stats.totalPlies = this.analysis.moves.length;
    this.analysis.stats.totalMoves = Math.ceil(this.analysis.moves.length / 2);

    // Recalculate white stats
    this.analysis.stats.white = {
      averageCpLoss: this.calculateAverageCpLoss(whiteMoves),
      inaccuracies: whiteMoves.filter((m) => m.classification === 'inaccuracy').length,
      mistakes: whiteMoves.filter((m) => m.classification === 'mistake').length,
      blunders: whiteMoves.filter((m) => m.classification === 'blunder').length,
      excellentMoves: whiteMoves.filter((m) => m.classification === 'excellent').length,
      brilliantMoves: whiteMoves.filter((m) => m.classification === 'brilliant').length,
      accuracy: this.calculateAccuracy(whiteMoves),
    };

    // Recalculate black stats
    this.analysis.stats.black = {
      averageCpLoss: this.calculateAverageCpLoss(blackMoves),
      inaccuracies: blackMoves.filter((m) => m.classification === 'inaccuracy').length,
      mistakes: blackMoves.filter((m) => m.classification === 'mistake').length,
      blunders: blackMoves.filter((m) => m.classification === 'blunder').length,
      excellentMoves: blackMoves.filter((m) => m.classification === 'excellent').length,
      brilliantMoves: blackMoves.filter((m) => m.classification === 'brilliant').length,
      accuracy: this.calculateAccuracy(blackMoves),
    };
  }

  private calculateAverageCpLoss(moves: MoveAnalysis[]): number {
    if (moves.length === 0) return 0;
    const total = moves.reduce((sum, m) => sum + m.cpLoss, 0);
    return Math.round(total / moves.length);
  }

  private calculateAccuracy(moves: MoveAnalysis[]): number {
    if (moves.length === 0) return 100;
    // Simple accuracy: percentage of non-error moves
    const goodMoves = moves.filter(
      (m) => !['inaccuracy', 'mistake', 'blunder'].includes(m.classification),
    ).length;
    return Math.round((goodMoves / moves.length) * 100);
  }

  /**
   * Build the final GameAnalysis
   */
  build(): GameAnalysis {
    return JSON.parse(JSON.stringify(this.analysis));
  }
}

/**
 * Factory function for creating a builder
 */
export function gameAnalysis(): GameAnalysisBuilder {
  return new GameAnalysisBuilder();
}
