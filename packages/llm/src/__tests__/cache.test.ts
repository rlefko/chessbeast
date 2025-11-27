/**
 * Tests for caching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ResponseCache,
  generatePositionCacheKey,
  generateOpeningCacheKey,
} from '../cache/response-cache.js';

describe('ResponseCache', () => {
  let cache: ResponseCache<string>;

  beforeEach(() => {
    cache = new ResponseCache<string>({
      maxSize: 3,
      ttlMs: 1000,
    });
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check existence with has()', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return undefined for expired entries', () => {
      cache.set('key1', 'value1');

      // Entry should exist
      expect(cache.get('key1')).toBe('value1');

      // Advance past TTL
      vi.advanceTimersByTime(1100);

      // Entry should be expired
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should remove expired entries from has() check', () => {
      cache.set('key1', 'value1');

      vi.advanceTimersByTime(1100);

      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('should evict LRU entry when at capacity', () => {
      // Use fake timers to ensure distinct timestamps for each operation
      vi.useFakeTimers();

      cache.set('key1', 'value1');
      vi.advanceTimersByTime(10);
      cache.set('key2', 'value2');
      vi.advanceTimersByTime(10);
      cache.set('key3', 'value3');
      vi.advanceTimersByTime(10);

      // Access key1 to make it more recently used
      cache.get('key1');
      vi.advanceTimersByTime(10);

      // Add another entry (should evict key2, the LRU)
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');

      vi.useRealTimers();
    });
  });

  describe('stats', () => {
    it('should report correct size', () => {
      expect(cache.getStats().size).toBe(0);

      cache.set('key1', 'value1');
      expect(cache.getStats().size).toBe(1);

      cache.set('key2', 'value2');
      expect(cache.getStats().size).toBe(2);
    });

    it('should report max size', () => {
      expect(cache.getStats().maxSize).toBe(3);
    });
  });
});

describe('Cache Key Generation', () => {
  describe('generatePositionCacheKey', () => {
    it('should generate consistent keys for same position', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      const key1 = generatePositionCacheKey(fen, 1500, 'normal');
      const key2 = generatePositionCacheKey(fen, 1500, 'normal');
      expect(key1).toBe(key2);
    });

    it('should group ratings into bands', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      const key1 = generatePositionCacheKey(fen, 1500, 'normal');
      const key2 = generatePositionCacheKey(fen, 1550, 'normal');
      expect(key1).toBe(key2);
    });

    it('should differentiate different rating bands', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      const key1 = generatePositionCacheKey(fen, 1500, 'normal');
      const key2 = generatePositionCacheKey(fen, 1700, 'normal');
      expect(key1).not.toBe(key2);
    });

    it('should differentiate verbosity levels', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      const key1 = generatePositionCacheKey(fen, 1500, 'normal');
      const key2 = generatePositionCacheKey(fen, 1500, 'detailed');
      expect(key1).not.toBe(key2);
    });
  });

  describe('generateOpeningCacheKey', () => {
    it('should normalize opening names', () => {
      const key1 = generateOpeningCacheKey('Sicilian Defense', 1500);
      const key2 = generateOpeningCacheKey('sicilian defense', 1500);
      expect(key1).toBe(key2);
    });

    it('should include rating band', () => {
      const key1 = generateOpeningCacheKey('Sicilian Defense', 1500);
      const key2 = generateOpeningCacheKey('Sicilian Defense', 1700);
      expect(key1).not.toBe(key2);
    });
  });
});
