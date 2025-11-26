/**
 * @chessbeast/core - Core analysis logic for ChessBeast
 *
 * This package contains the main analysis pipeline including:
 * - Move classification (inaccuracy, mistake, blunder)
 * - Critical moment detection
 * - Annotation planning
 */

export const VERSION = '0.1.0';

/**
 * Move classification categories
 */
export type MoveClassification =
  | 'book'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'brilliant'
  | 'forced';

/**
 * Engine evaluation result
 */
export interface EngineEval {
  /** Centipawns from side to move */
  cp?: number;
  /** Mate in N (positive = side to move mates) */
  mate?: number;
  /** Search depth reached */
  depth: number;
  /** Best line in SAN or UCI */
  bestLine: string[];
}

/**
 * Placeholder for the main analysis function
 */
export function analyzeGame(): void {
  console.log('Analysis pipeline not yet implemented');
}
