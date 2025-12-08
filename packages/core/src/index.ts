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

// Re-export types
export * from './types/index.js';

// Re-export classifier utilities
export * from './classifier/index.js';

// Re-export pipeline
export * from './pipeline/index.js';

// Re-export exploration
export * from './exploration/index.js';
