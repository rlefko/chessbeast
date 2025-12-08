/**
 * Artifact Cache Configuration
 *
 * Configuration types and defaults for the multi-layer artifact cache.
 */

/**
 * Cache configuration for artifact storage
 */
export interface ArtifactCacheConfig {
  /** Maximum number of engine eval artifacts to cache */
  maxEngineEvals: number;

  /** Maximum number of theme artifacts to cache */
  maxThemes: number;

  /** Maximum number of candidate moves artifacts to cache */
  maxCandidates: number;

  /** Maximum number of move assessment artifacts to cache */
  maxMoveAssessments: number;

  /** Maximum number of HCE artifacts to cache */
  maxHce: number;

  /** Time-to-live in milliseconds (0 = no expiration) */
  ttlMs: number;

  /** Whether to track cache statistics */
  trackStats: boolean;
}

/**
 * Default cache configuration
 *
 * Sized for typical game analysis (40-60 moves × variations):
 * - Engine evals: Most expensive to compute, highest cache priority
 * - Themes: Moderate computation, frequently accessed
 * - Candidates: Quick to compute but useful to cache
 * - Move assessments: Tied to specific edges, moderate cache
 * - HCE: Cheap to compute, lower priority
 */
export const DEFAULT_CACHE_CONFIG: ArtifactCacheConfig = {
  maxEngineEvals: 5000,
  maxThemes: 3000,
  maxCandidates: 2000,
  maxMoveAssessments: 4000,
  maxHce: 2000,
  ttlMs: 3600000, // 1 hour
  trackStats: true,
};

/**
 * Compact cache configuration for memory-constrained environments
 */
export const COMPACT_CACHE_CONFIG: ArtifactCacheConfig = {
  maxEngineEvals: 1000,
  maxThemes: 500,
  maxCandidates: 500,
  maxMoveAssessments: 1000,
  maxHce: 500,
  ttlMs: 1800000, // 30 minutes
  trackStats: false,
};

/**
 * Large cache configuration for deep analysis sessions
 */
export const LARGE_CACHE_CONFIG: ArtifactCacheConfig = {
  maxEngineEvals: 20000,
  maxThemes: 10000,
  maxCandidates: 8000,
  maxMoveAssessments: 15000,
  maxHce: 8000,
  ttlMs: 7200000, // 2 hours
  trackStats: true,
};

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total cache hits across all artifact types */
  totalHits: number;

  /** Total cache misses across all artifact types */
  totalMisses: number;

  /** Hit rate (0-1) */
  hitRate: number;

  /** Per-artifact-type statistics */
  byType: {
    engineEval: TypeStats;
    theme: TypeStats;
    candidates: TypeStats;
    moveAssessment: TypeStats;
    hce: TypeStats;
  };

  /** Memory usage estimate in bytes */
  estimatedMemoryBytes: number;

  /** Number of evictions since cache creation */
  totalEvictions: number;

  /** Cache uptime in milliseconds */
  uptimeMs: number;
}

/**
 * Statistics for a single artifact type
 */
export interface TypeStats {
  /** Current item count */
  count: number;

  /** Maximum capacity */
  maxCount: number;

  /** Hit count */
  hits: number;

  /** Miss count */
  misses: number;

  /** Eviction count */
  evictions: number;

  /** Hit rate (0-1) */
  hitRate: number;
}

/**
 * Create initial type stats
 */
export function createTypeStats(maxCount: number): TypeStats {
  return {
    count: 0,
    maxCount,
    hits: 0,
    misses: 0,
    evictions: 0,
    hitRate: 0,
  };
}

/**
 * Update hit rate for type stats
 */
export function updateHitRate(stats: TypeStats): void {
  const total = stats.hits + stats.misses;
  stats.hitRate = total > 0 ? stats.hits / total : 0;
}
