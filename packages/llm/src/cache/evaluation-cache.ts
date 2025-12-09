/**
 * Evaluation cache types for Stockfish evaluation caching
 *
 * These types support depth-aware and multipv-aware lookup to avoid
 * redundant Stockfish calls by caching evaluations keyed by normalized FEN.
 */

import type { CacheConfig } from '../config/llm-config.js';

/**
 * Cached evaluation entry
 */
export interface CachedEvaluation {
  /** Centipawn score (from side to move perspective) */
  cp: number;
  /** Mate in N (0 if not mate) */
  mate: number;
  /** Depth at which this evaluation was computed */
  depth: number;
  /** Best line (sequence of moves in UCI) */
  bestLine: string[];
  /** Alternative lines from multipv */
  alternatives?: Array<{
    cp: number;
    mate: number;
    bestLine: string[];
  }>;
  /** Number of principal variations computed */
  multipv: number;
  /** When the evaluation was computed */
  timestamp: number;
}

/**
 * Cache entry with metadata for LRU eviction
 */
interface CacheEntry {
  value: CachedEvaluation;
  createdAt: number;
  expiresAt: number;
  lastAccess: number;
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 1000,
  ttlMs: 3600000, // 1 hour
};

/**
 * Evaluation cache with depth-aware and multipv-aware lookup
 */
export class EvaluationCache {
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly config: CacheConfig;
  private hits = 0;
  private misses = 0;

  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Normalize FEN key by removing halfmove clock and fullmove number
   * These don't affect position evaluation
   */
  private normalizeKey(fen: string): string {
    const parts = fen.split(' ');
    // Keep only: piece placement, side to move, castling rights, en passant
    return `eval:${parts.slice(0, 4).join(' ')}`;
  }

  /**
   * Get cached evaluation if depth and multipv are sufficient
   *
   * @param fen - Position in FEN notation
   * @param minDepth - Minimum required depth
   * @param minMultipv - Minimum required number of principal variations (default: 1)
   * @returns Cached evaluation if found and sufficient, undefined otherwise
   */
  get(fen: string, minDepth: number, minMultipv: number = 1): CachedEvaluation | undefined {
    const key = this.normalizeKey(fen);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check if entry has expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Check if cached depth is sufficient
    if (entry.value.depth < minDepth) {
      this.misses++;
      return undefined;
    }

    // Check if cached multipv is sufficient
    if (entry.value.multipv < minMultipv) {
      this.misses++;
      return undefined;
    }

    // Update last access time
    entry.lastAccess = Date.now();
    this.hits++;

    return entry.value;
  }

  /**
   * Store evaluation in cache
   *
   * @param fen - Position in FEN notation
   * @param evaluation - Evaluation to cache
   */
  set(fen: string, evaluation: CachedEvaluation): void {
    const key = this.normalizeKey(fen);
    const now = Date.now();

    // Enforce size limit with LRU eviction
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value: evaluation,
      createdAt: now,
      expiresAt: now + this.config.ttlMs,
      lastAccess: now,
    });
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { hits: number; misses: number; size: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Clear all cached evaluations
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
