/**
 * @chessbeast/utils - Shared utilities for ChessBeast
 *
 * This package provides shared utility functions used across multiple packages.
 *
 * Note: Full utility consolidation will happen in PR2 (God class decomposition).
 * For PR1, this package establishes the structure and re-exports types.
 *
 * Usage:
 *   import { COMMENT_LIMITS } from '@chessbeast/utils/validation';
 */

// Re-export validation utilities
export * from './validation/index.js';
