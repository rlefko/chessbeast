/**
 * Validation Utilities
 *
 * Type re-exports for validation utilities.
 *
 * Note: Full validation utilities will be moved here from @chessbeast/llm
 * in PR2 (God class decomposition). For PR1, we only set up the package
 * structure and re-export types from @chessbeast/types.
 */

// Re-export annotation types used in validation
export type { CommentType, CommentLimits } from '@chessbeast/types/annotation';
export { COMMENT_LIMITS } from '@chessbeast/types/annotation';
