/**
 * Shared exploration types
 *
 * Service interfaces consumed by the engine-driven explorer and the CLI
 * orchestrator adapters, plus the explored-line shape used for variations.
 */

import type { EngineEvaluation, EngineService } from '@chessbeast/core';

/**
 * Engine evaluation and service interfaces are the canonical @chessbeast/core
 * types - re-exported here so explorer consumers have a single definition.
 */
export type { EngineEvaluation, EngineService };

/**
 * Maia service interface (the subset of @chessbeast/core MaiaService used by
 * the explorer - core's interface additionally requires estimateRating)
 */
export interface MaiaService {
  predictMoves(fen: string, rating: number): Promise<Array<{ san: string; probability: number }>>;
}

/**
 * Purpose of an explored line
 */
export type LinePurpose = 'best' | 'human_alternative' | 'refutation' | 'trap' | 'thematic';

/**
 * Source of an explored line
 */
export type LineSource = 'engine' | 'maia' | 'llm';

/**
 * A single explored line with its annotation
 */
export interface ExploredLine {
  /** SAN moves in this line */
  moves: string[];
  /** LLM explanation for key moves in this line (move index -> comment) */
  annotations: Map<number, string>;
  /** NAGs for moves in this line (move index -> NAG like "$1", "$4") */
  nags: Map<number, string>;
  /** Nested variations branching from this line */
  branches: ExploredLine[];
  /** Purpose of this line */
  purpose: LinePurpose;
  /** Where this line came from */
  source: LineSource;
  /** Final evaluation of the line */
  finalEval?: EngineEvaluation;
}
