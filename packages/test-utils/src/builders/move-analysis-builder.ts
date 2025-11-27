/**
 * Fluent builder for MoveAnalysis test data
 */

import type { MoveAnalysis, EngineEvaluation, MoveClassification } from '@chessbeast/core';

/**
 * Default engine evaluation
 */
function defaultEval(): EngineEvaluation {
  return {
    cp: 0,
    depth: 20,
    pv: [],
    nodes: 1000000,
  };
}

/**
 * Fluent builder for creating MoveAnalysis instances
 */
export class MoveAnalysisBuilder {
  private move: MoveAnalysis;

  constructor() {
    this.move = {
      plyIndex: 0,
      moveNumber: 1,
      isWhiteMove: true,
      san: 'e4',
      fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      evalBefore: defaultEval(),
      evalAfter: { ...defaultEval(), cp: 25 },
      bestMove: 'e4',
      cpLoss: 0,
      classification: 'book' as MoveClassification,
      isCriticalMoment: false,
    };
  }

  /**
   * Set ply index (0-based position in game)
   */
  atPly(plyIndex: number): this {
    this.move.plyIndex = plyIndex;
    this.move.moveNumber = Math.floor(plyIndex / 2) + 1;
    this.move.isWhiteMove = plyIndex % 2 === 0;
    return this;
  }

  /**
   * Set move number and color
   */
  atMoveNumber(moveNumber: number, isWhite: boolean): this {
    this.move.moveNumber = moveNumber;
    this.move.isWhiteMove = isWhite;
    this.move.plyIndex = (moveNumber - 1) * 2 + (isWhite ? 0 : 1);
    return this;
  }

  /**
   * Set the move in SAN notation
   */
  withSan(san: string): this {
    this.move.san = san;
    return this;
  }

  /**
   * Set positions before and after the move
   */
  withPositions(fenBefore: string, fenAfter: string): this {
    this.move.fenBefore = fenBefore;
    this.move.fenAfter = fenAfter;
    return this;
  }

  /**
   * Set evaluation before the move
   */
  withEvalBefore(eval_: Partial<EngineEvaluation>): this {
    this.move.evalBefore = { ...this.move.evalBefore, ...eval_ };
    return this;
  }

  /**
   * Set evaluation after the move
   */
  withEvalAfter(eval_: Partial<EngineEvaluation>): this {
    this.move.evalAfter = { ...this.move.evalAfter, ...eval_ };
    return this;
  }

  /**
   * Set both evaluations with centipawn values
   */
  withEval(cpBefore: number, cpAfter: number): this {
    this.move.evalBefore.cp = cpBefore;
    this.move.evalAfter.cp = cpAfter;
    // Calculate cp loss (from the perspective of the player who moved)
    const cpLoss = this.move.isWhiteMove ? cpBefore - cpAfter : cpAfter - cpBefore;
    this.move.cpLoss = Math.max(0, cpLoss);
    return this;
  }

  /**
   * Set the best move
   */
  withBestMove(san: string): this {
    this.move.bestMove = san;
    return this;
  }

  /**
   * Set cp loss directly
   */
  withCpLoss(cpLoss: number): this {
    this.move.cpLoss = cpLoss;
    return this;
  }

  /**
   * Set move classification
   */
  withClassification(classification: MoveClassification): this {
    this.move.classification = classification;
    return this;
  }

  /**
   * Mark as a blunder
   */
  asBlunder(cpLoss: number = 300): this {
    this.move.classification = 'blunder';
    this.move.cpLoss = cpLoss;
    this.move.isCriticalMoment = true;
    return this;
  }

  /**
   * Mark as a mistake
   */
  asMistake(cpLoss: number = 150): this {
    this.move.classification = 'mistake';
    this.move.cpLoss = cpLoss;
    this.move.isCriticalMoment = true;
    return this;
  }

  /**
   * Mark as an inaccuracy
   */
  asInaccuracy(cpLoss: number = 75): this {
    this.move.classification = 'inaccuracy';
    this.move.cpLoss = cpLoss;
    return this;
  }

  /**
   * Mark as excellent
   */
  asExcellent(): this {
    this.move.classification = 'excellent';
    this.move.cpLoss = 0;
    return this;
  }

  /**
   * Mark as brilliant
   */
  asBrilliant(): this {
    this.move.classification = 'brilliant';
    this.move.cpLoss = 0;
    this.move.isCriticalMoment = true;
    return this;
  }

  /**
   * Mark as book move
   */
  asBook(): this {
    this.move.classification = 'book';
    this.move.cpLoss = 0;
    return this;
  }

  /**
   * Mark as good move
   */
  asGood(): this {
    this.move.classification = 'good';
    this.move.cpLoss = 0;
    return this;
  }

  /**
   * Set human probability from Maia
   */
  withHumanProbability(probability: number): this {
    this.move.humanProbability = probability;
    return this;
  }

  /**
   * Mark as critical moment
   */
  asCriticalMoment(isCritical: boolean = true): this {
    this.move.isCriticalMoment = isCritical;
    return this;
  }

  /**
   * Add annotation comment
   */
  withComment(comment: string): this {
    this.move.comment = comment;
    return this;
  }

  /**
   * Add alternative moves
   */
  withAlternatives(
    alternatives: Array<{ san: string; eval: EngineEvaluation; tag?: string }>,
  ): this {
    this.move.alternatives = alternatives.map((alt) => ({
      san: alt.san,
      eval: alt.eval,
      tag: alt.tag as 'tactical' | 'strategic' | 'simplifying' | 'defensive' | 'aggressive',
    }));
    return this;
  }

  /**
   * Build the final MoveAnalysis
   */
  build(): MoveAnalysis {
    return JSON.parse(JSON.stringify(this.move));
  }
}

/**
 * Factory function for creating a builder
 */
export function moveAnalysis(): MoveAnalysisBuilder {
  return new MoveAnalysisBuilder();
}

/**
 * Create a sequence of moves quickly
 */
export function createMoveSequence(
  moves: Array<{ san: string; classification?: MoveClassification; cpLoss?: number }>,
  _startingFen: string = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
): MoveAnalysis[] {
  return moves.map((m, i) => {
    const builder = moveAnalysis().atPly(i).withSan(m.san);

    if (m.classification) {
      builder.withClassification(m.classification);
    }
    if (m.cpLoss !== undefined) {
      builder.withCpLoss(m.cpLoss);
    }

    return builder.build();
  });
}
