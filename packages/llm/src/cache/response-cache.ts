/**
 * LRU cache with TTL for LLM responses
 */

import type { CacheConfig } from '../config/llm-config.js';

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** When the entry was created */
  createdAt: number;
  /** When the entry expires */
  expiresAt: number;
  /** Access count for LRU */
  accessCount: number;
  /** Last access time */
  lastAccess: number;
}

/**
 * LRU cache with TTL for response caching
 */
export class ResponseCache<T> {
  private readonly cache: Map<string, CacheEntry<T>> = new Map();
  private readonly config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  /**
   * Get a value from the cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Update access metadata
    entry.accessCount++;
    entry.lastAccess = Date.now();

    return entry.value;
  }

  /**
   * Set a value in the cache
   */
  set(key: string, value: T): void {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      createdAt: now,
      expiresAt: now + this.config.ttlMs,
      accessCount: 1,
      lastAccess: now,
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from the cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    // Clean expired entries before reporting
    this.cleanExpired();
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache) {
      // Also clean expired entries
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        continue;
      }

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
   * Clean expired entries
   */
  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Generate a cache key for a position annotation
 */
export function generatePositionCacheKey(fen: string, targetRating: number): string {
  // Normalize FEN by removing move counters (last two numbers)
  const fenParts = fen.split(' ');
  const normalizedFen = fenParts.slice(0, 4).join(' ');

  // Group ratings into bands of 200
  const ratingBand = Math.floor(targetRating / 200) * 200;

  return `pos:${normalizedFen}:${ratingBand}`;
}

/**
 * Generate a cache key for an opening annotation
 */
export function generateOpeningCacheKey(openingName: string, targetRating: number): string {
  // Normalize opening name
  const normalized = openingName.toLowerCase().replace(/\s+/g, '-');
  const ratingBand = Math.floor(targetRating / 200) * 200;

  return `opening:${normalized}:${ratingBand}`;
}
