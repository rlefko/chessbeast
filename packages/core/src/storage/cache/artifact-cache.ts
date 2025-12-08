/**
 * Artifact Cache
 *
 * Multi-layer cache for position artifacts with tier-aware lookups.
 * Provides efficient caching for all artifact types with LRU eviction.
 */

import type { AnalysisTier } from '../artifacts/base.js';
import type { CandidateMovesArtifact } from '../artifacts/candidates.js';
import type { EngineEvalArtifact } from '../artifacts/engine-eval.js';
import type { HCEArtifact } from '../artifacts/hce.js';
import type { MoveAssessmentArtifact } from '../artifacts/move-assessment.js';
import type { ThemeArtifact } from '../artifacts/theme.js';

import {
  type ArtifactCacheConfig,
  type CacheStats,
  type TypeStats,
  DEFAULT_CACHE_CONFIG,
  createTypeStats,
  updateHitRate,
} from './cache-config.js';
import { LRUCache } from './memory-lru.js';

/**
 * Multi-layer artifact cache
 *
 * Features:
 * - Separate LRU caches per artifact type
 * - Tier-aware lookups for engine evaluations
 * - Rating-aware lookups for candidates
 * - Comprehensive statistics tracking
 */
export class ArtifactCache {
  private readonly config: ArtifactCacheConfig;
  private readonly createdAt: number;

  // Per-type LRU caches
  private engineEvalCache: LRUCache<string, EngineEvalArtifact>;
  private themeCache: LRUCache<string, ThemeArtifact>;
  private candidatesCache: LRUCache<string, CandidateMovesArtifact>;
  private moveAssessmentCache: LRUCache<string, MoveAssessmentArtifact>;
  private hceCache: LRUCache<string, HCEArtifact>;

  constructor(config: ArtifactCacheConfig = DEFAULT_CACHE_CONFIG) {
    this.config = config;
    this.createdAt = Date.now();

    // Initialize per-type caches
    this.engineEvalCache = new LRUCache({
      maxSize: config.maxEngineEvals,
      ttlMs: config.ttlMs,
      trackStats: config.trackStats,
    });

    this.themeCache = new LRUCache({
      maxSize: config.maxThemes,
      ttlMs: config.ttlMs,
      trackStats: config.trackStats,
    });

    this.candidatesCache = new LRUCache({
      maxSize: config.maxCandidates,
      ttlMs: config.ttlMs,
      trackStats: config.trackStats,
    });

    this.moveAssessmentCache = new LRUCache({
      maxSize: config.maxMoveAssessments,
      ttlMs: config.ttlMs,
      trackStats: config.trackStats,
    });

    this.hceCache = new LRUCache({
      maxSize: config.maxHce,
      ttlMs: config.ttlMs,
      trackStats: config.trackStats,
    });
  }

  // ============================================================
  // Engine Evaluation Cache
  // ============================================================

  /**
   * Get an engine evaluation artifact
   *
   * Tier-aware lookup: Returns cached eval if it meets depth/multipv requirements.
   *
   * @param positionKey - Position key to look up
   * @param minDepth - Minimum acceptable depth (optional)
   * @param minMultipv - Minimum acceptable multipv (optional)
   */
  getEngineEval(
    positionKey: string,
    minDepth?: number,
    minMultipv?: number,
  ): EngineEvalArtifact | undefined {
    const artifact = this.engineEvalCache.get(positionKey);

    if (!artifact) return undefined;

    // Check if cached eval meets requirements
    if (minDepth !== undefined && artifact.depth < minDepth) {
      return undefined;
    }

    if (minMultipv !== undefined && artifact.multipv < minMultipv) {
      return undefined;
    }

    return artifact;
  }

  /**
   * Get engine evaluation for a specific tier
   */
  getEngineEvalForTier(positionKey: string, tier: AnalysisTier): EngineEvalArtifact | undefined {
    const requirements = TIER_REQUIREMENTS[tier];
    return this.getEngineEval(positionKey, requirements.minDepth, requirements.minMultipv);
  }

  /**
   * Set an engine evaluation artifact
   *
   * Replaces existing entry only if new eval is higher quality.
   */
  setEngineEval(artifact: EngineEvalArtifact): void {
    const existing = this.engineEvalCache.get(artifact.positionKey);

    // Only replace if new eval is better
    if (existing && existing.depth >= artifact.depth && existing.multipv >= artifact.multipv) {
      return;
    }

    this.engineEvalCache.set(artifact.positionKey, artifact);
  }

  // ============================================================
  // Theme Cache
  // ============================================================

  /**
   * Get a theme artifact
   *
   * @param positionKey - Position key to look up
   * @param minTier - Minimum acceptable tier (optional)
   */
  getThemes(positionKey: string, minTier?: AnalysisTier): ThemeArtifact | undefined {
    const artifact = this.themeCache.get(positionKey);

    if (!artifact) return undefined;

    // Check tier if specified
    if (minTier !== undefined && !tierAtLeast(artifact.tier, minTier)) {
      return undefined;
    }

    return artifact;
  }

  /**
   * Set a theme artifact
   *
   * Replaces existing entry only if new artifact is higher tier.
   */
  setThemes(artifact: ThemeArtifact): void {
    const existing = this.themeCache.get(artifact.positionKey);

    // Only replace if new artifact is better tier
    if (existing && !tierAtLeast(artifact.tier, existing.tier)) {
      return;
    }

    this.themeCache.set(artifact.positionKey, artifact);
  }

  // ============================================================
  // Candidates Cache
  // ============================================================

  /**
   * Get a candidates artifact
   *
   * @param positionKey - Position key to look up
   * @param minSfDepth - Minimum Stockfish depth (optional)
   */
  getCandidates(positionKey: string, minSfDepth?: number): CandidateMovesArtifact | undefined {
    const artifact = this.candidatesCache.get(positionKey);

    if (!artifact) return undefined;

    // Check depth if specified
    if (minSfDepth !== undefined && artifact.selectionMeta.sfDepth < minSfDepth) {
      return undefined;
    }

    return artifact;
  }

  /**
   * Set a candidates artifact
   */
  setCandidates(artifact: CandidateMovesArtifact): void {
    const existing = this.candidatesCache.get(artifact.positionKey);

    // Only replace if new artifact has higher depth
    if (existing && existing.selectionMeta.sfDepth >= artifact.selectionMeta.sfDepth) {
      return;
    }

    this.candidatesCache.set(artifact.positionKey, artifact);
  }

  // ============================================================
  // Move Assessment Cache
  // ============================================================

  /**
   * Get a move assessment artifact by key
   */
  getMoveAssessment(artifactKey: string): MoveAssessmentArtifact | undefined {
    return this.moveAssessmentCache.get(artifactKey);
  }

  /**
   * Get a move assessment by parent and child position keys
   */
  getMoveAssessmentByPositions(
    parentPositionKey: string,
    childPositionKey: string,
  ): MoveAssessmentArtifact | undefined {
    // Generate the expected key format
    const expectedKey = `moveAssessment:${parentPositionKey}:${childPositionKey}`;
    return this.moveAssessmentCache.get(expectedKey);
  }

  /**
   * Set a move assessment artifact
   */
  setMoveAssessment(artifact: MoveAssessmentArtifact): void {
    // Use the artifact's key for storage
    const key = `moveAssessment:${artifact.parentPositionKey}:${artifact.childPositionKey}`;
    this.moveAssessmentCache.set(key, artifact);
  }

  // ============================================================
  // HCE Cache
  // ============================================================

  /**
   * Get an HCE artifact
   */
  getHce(positionKey: string): HCEArtifact | undefined {
    return this.hceCache.get(positionKey);
  }

  /**
   * Set an HCE artifact
   */
  setHce(artifact: HCEArtifact): void {
    this.hceCache.set(artifact.positionKey, artifact);
  }

  // ============================================================
  // Cache Management
  // ============================================================

  /**
   * Get comprehensive cache statistics
   */
  getStats(): CacheStats {
    const engineStats = this.engineEvalCache.getStats();
    const themeStats = this.themeCache.getStats();
    const candidatesStats = this.candidatesCache.getStats();
    const moveAssessmentStats = this.moveAssessmentCache.getStats();
    const hceStats = this.hceCache.getStats();

    const totalHits =
      engineStats.hits +
      themeStats.hits +
      candidatesStats.hits +
      moveAssessmentStats.hits +
      hceStats.hits;

    const totalMisses =
      engineStats.misses +
      themeStats.misses +
      candidatesStats.misses +
      moveAssessmentStats.misses +
      hceStats.misses;

    const totalEvictions =
      engineStats.evictions +
      themeStats.evictions +
      candidatesStats.evictions +
      moveAssessmentStats.evictions +
      hceStats.evictions;

    const estimatedMemoryBytes =
      engineStats.memoryBytes +
      themeStats.memoryBytes +
      candidatesStats.memoryBytes +
      moveAssessmentStats.memoryBytes +
      hceStats.memoryBytes;

    const engineTypeStats = this.lruStatsToTypeStats(engineStats, this.config.maxEngineEvals);
    const themeTypeStats = this.lruStatsToTypeStats(themeStats, this.config.maxThemes);
    const candidatesTypeStats = this.lruStatsToTypeStats(
      candidatesStats,
      this.config.maxCandidates,
    );
    const moveAssessmentTypeStats = this.lruStatsToTypeStats(
      moveAssessmentStats,
      this.config.maxMoveAssessments,
    );
    const hceTypeStats = this.lruStatsToTypeStats(hceStats, this.config.maxHce);

    return {
      totalHits,
      totalMisses,
      hitRate: totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0,
      byType: {
        engineEval: engineTypeStats,
        theme: themeTypeStats,
        candidates: candidatesTypeStats,
        moveAssessment: moveAssessmentTypeStats,
        hce: hceTypeStats,
      },
      estimatedMemoryBytes,
      totalEvictions,
      uptimeMs: Date.now() - this.createdAt,
    };
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.engineEvalCache.clear();
    this.themeCache.clear();
    this.candidatesCache.clear();
    this.moveAssessmentCache.clear();
    this.hceCache.clear();
  }

  /**
   * Clear a specific cache type
   */
  clearType(type: 'engineEval' | 'theme' | 'candidates' | 'moveAssessment' | 'hce'): void {
    switch (type) {
      case 'engineEval':
        this.engineEvalCache.clear();
        break;
      case 'theme':
        this.themeCache.clear();
        break;
      case 'candidates':
        this.candidatesCache.clear();
        break;
      case 'moveAssessment':
        this.moveAssessmentCache.clear();
        break;
      case 'hce':
        this.hceCache.clear();
        break;
    }
  }

  /**
   * Prune expired entries from all caches
   */
  prune(): number {
    return (
      this.engineEvalCache.prune() +
      this.themeCache.prune() +
      this.candidatesCache.prune() +
      this.moveAssessmentCache.prune() +
      this.hceCache.prune()
    );
  }

  /**
   * Get the current configuration
   */
  getConfig(): ArtifactCacheConfig {
    return { ...this.config };
  }

  /**
   * Convert LRU stats to TypeStats format
   */
  private lruStatsToTypeStats(
    lruStats: { count: number; hits: number; misses: number; evictions: number },
    maxCount: number,
  ): TypeStats {
    const stats = createTypeStats(maxCount);
    stats.count = lruStats.count;
    stats.hits = lruStats.hits;
    stats.misses = lruStats.misses;
    stats.evictions = lruStats.evictions;
    updateHitRate(stats);
    return stats;
  }
}

/**
 * Tier requirements for engine eval lookups
 */
const TIER_REQUIREMENTS: Record<AnalysisTier, { minDepth: number; minMultipv: number }> = {
  shallow: { minDepth: 12, minMultipv: 1 },
  standard: { minDepth: 18, minMultipv: 3 },
  full: { minDepth: 22, minMultipv: 5 },
};

/**
 * Check if tier1 is at least as high as tier2
 */
function tierAtLeast(tier1: AnalysisTier, tier2: AnalysisTier): boolean {
  const tierOrder: Record<AnalysisTier, number> = {
    shallow: 0,
    standard: 1,
    full: 2,
  };
  return tierOrder[tier1] >= tierOrder[tier2];
}

/**
 * Create an artifact cache with default configuration
 */
export function createArtifactCache(config?: Partial<ArtifactCacheConfig>): ArtifactCache {
  return new ArtifactCache({
    ...DEFAULT_CACHE_CONFIG,
    ...config,
  });
}
