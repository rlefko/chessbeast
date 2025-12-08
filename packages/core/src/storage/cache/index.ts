/**
 * Cache module exports
 *
 * In-memory caching for position artifacts with LRU eviction.
 */

// Configuration
export {
  type ArtifactCacheConfig,
  type CacheStats,
  type TypeStats,
  DEFAULT_CACHE_CONFIG,
  COMPACT_CACHE_CONFIG,
  LARGE_CACHE_CONFIG,
  createTypeStats,
  updateHitRate,
} from './cache-config.js';

// LRU Cache
export { type LRUStats, type LRUOptions, LRUCache, createLRUCache } from './memory-lru.js';

// Artifact Cache
export { ArtifactCache, createArtifactCache } from './artifact-cache.js';
