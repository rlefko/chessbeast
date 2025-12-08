/**
 * Memory LRU Cache
 *
 * Generic LRU (Least Recently Used) cache implementation with:
 * - O(1) get/set operations
 * - TTL-based expiration
 * - Size-based eviction
 * - Optional statistics tracking
 */

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  /** The cached value */
  value: T;

  /** When the entry was created (timestamp) */
  createdAt: number;

  /** When the entry was last accessed (timestamp) */
  lastAccessedAt: number;

  /** Estimated size in bytes (for memory tracking) */
  sizeBytes: number;
}

/**
 * LRU cache statistics
 */
export interface LRUStats {
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

  /** Expired count (TTL-based) */
  expired: number;

  /** Estimated memory usage in bytes */
  memoryBytes: number;
}

/**
 * LRU cache options
 */
export interface LRUOptions {
  /** Maximum number of entries */
  maxSize: number;

  /** Time-to-live in milliseconds (0 = no expiration) */
  ttlMs: number;

  /** Whether to track statistics */
  trackStats: boolean;

  /** Function to estimate entry size in bytes */
  sizeEstimator?: (value: unknown) => number;
}

/**
 * Generic LRU cache implementation
 *
 * Uses Map for O(1) operations while maintaining insertion order
 * for LRU eviction (Map iterates in insertion order).
 */
export class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly trackStats: boolean;
  private readonly sizeEstimator: (value: unknown) => number;

  // Statistics
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expired = 0;
  private totalMemoryBytes = 0;

  constructor(options: LRUOptions) {
    this.maxSize = options.maxSize;
    this.ttlMs = options.ttlMs;
    this.trackStats = options.trackStats;
    this.sizeEstimator = options.sizeEstimator ?? defaultSizeEstimator;
  }

  /**
   * Get a value from the cache
   *
   * Returns undefined if not found or expired.
   * Moves the entry to the end (most recently used) on access.
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      if (this.trackStats) this.misses++;
      return undefined;
    }

    // Check TTL expiration
    if (this.ttlMs > 0 && Date.now() - entry.createdAt > this.ttlMs) {
      this.delete(key);
      if (this.trackStats) {
        this.misses++;
        this.expired++;
      }
      return undefined;
    }

    // Move to end (most recently used) by re-inserting
    this.cache.delete(key);
    entry.lastAccessedAt = Date.now();
    this.cache.set(key, entry);

    if (this.trackStats) this.hits++;
    return entry.value;
  }

  /**
   * Set a value in the cache
   *
   * Evicts least recently used entries if at capacity.
   */
  set(key: K, value: V): void {
    // If key exists, delete it first to update position
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key)!;
      this.totalMemoryBytes -= oldEntry.sizeBytes;
      this.cache.delete(key);
    }

    // Evict if at capacity
    while (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const sizeBytes = this.sizeEstimator(value);
    const now = Date.now();

    const entry: CacheEntry<V> = {
      value,
      createdAt: now,
      lastAccessedAt: now,
      sizeBytes,
    };

    this.cache.set(key, entry);
    this.totalMemoryBytes += sizeBytes;
  }

  /**
   * Check if key exists (without updating access time)
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check TTL
    if (this.ttlMs > 0 && Date.now() - entry.createdAt > this.ttlMs) {
      this.delete(key);
      if (this.trackStats) this.expired++;
      return false;
    }

    return true;
  }

  /**
   * Delete an entry from the cache
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.totalMemoryBytes -= entry.sizeBytes;
      return this.cache.delete(key);
    }
    return false;
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
    this.totalMemoryBytes = 0;
  }

  /**
   * Get the current number of entries
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): LRUStats {
    return {
      count: this.cache.size,
      maxCount: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expired: this.expired,
      memoryBytes: this.totalMemoryBytes,
    };
  }

  /**
   * Reset statistics (keeps cached data)
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.expired = 0;
  }

  /**
   * Get all keys (for iteration)
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Get all values (for iteration)
   */
  *values(): IterableIterator<V> {
    for (const entry of this.cache.values()) {
      yield entry.value;
    }
  }

  /**
   * Find entries matching a predicate
   */
  find(predicate: (value: V, key: K) => boolean): V | undefined {
    for (const [key, entry] of this.cache) {
      if (predicate(entry.value, key)) {
        // Update access time
        return this.get(key);
      }
    }
    return undefined;
  }

  /**
   * Find all entries matching a predicate
   */
  findAll(predicate: (value: V, key: K) => boolean): V[] {
    const results: V[] = [];
    for (const [key, entry] of this.cache) {
      if (predicate(entry.value, key)) {
        results.push(entry.value);
      }
    }
    return results;
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    // Map iterates in insertion order, first entry is LRU
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.delete(firstKey);
      if (this.trackStats) this.evictions++;
    }
  }

  /**
   * Prune expired entries
   *
   * Call periodically to clean up expired entries proactively.
   */
  prune(): number {
    if (this.ttlMs === 0) return 0;

    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > this.ttlMs) {
        this.delete(key);
        pruned++;
        if (this.trackStats) this.expired++;
      }
    }

    return pruned;
  }
}

/**
 * Default size estimator for cache entries
 *
 * Provides a rough estimate based on JSON serialization.
 * Override with a custom function for more accurate estimates.
 */
function defaultSizeEstimator(value: unknown): number {
  try {
    // Base overhead for the entry wrapper
    const overhead = 64;

    // Estimate value size via JSON serialization
    const jsonSize = JSON.stringify(value).length * 2; // UTF-16 chars

    return overhead + jsonSize;
  } catch {
    // Fallback for non-serializable values
    return 1024;
  }
}

/**
 * Create an LRU cache with default options
 */
export function createLRUCache<K, V>(
  maxSize: number,
  ttlMs: number = 0,
  trackStats: boolean = true,
): LRUCache<K, V> {
  return new LRUCache<K, V>({
    maxSize,
    ttlMs,
    trackStats,
  });
}
