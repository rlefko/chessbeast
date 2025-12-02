/**
 * Unit tests for tiered Position Cards
 */

import { describe, it, expect } from 'vitest';
import { selectCardTier } from '../cards/recommendation.js';
import { CARD_TIER_CONFIGS, type CardTier } from '../cards/types.js';

describe('Card Tier Selection', () => {
  describe('selectCardTier', () => {
    it('should return full tier for initial position', () => {
      expect(selectCardTier(0, true)).toBe('full');
      expect(selectCardTier(5, true)).toBe('full');
      expect(selectCardTier(20, true)).toBe('full');
    });

    it('should return standard tier for shallow depths', () => {
      expect(selectCardTier(0, false)).toBe('standard');
      expect(selectCardTier(3, false)).toBe('standard');
      expect(selectCardTier(6, false)).toBe('standard');
    });

    it('should return shallow tier for medium depths', () => {
      expect(selectCardTier(7, false)).toBe('shallow');
      expect(selectCardTier(10, false)).toBe('shallow');
      expect(selectCardTier(12, false)).toBe('shallow');
    });

    it('should return minimal tier for deep positions', () => {
      expect(selectCardTier(13, false)).toBe('minimal');
      expect(selectCardTier(15, false)).toBe('minimal');
      expect(selectCardTier(20, false)).toBe('minimal');
    });

    it('should return minimal tier for SKIP recommendation', () => {
      expect(selectCardTier(3, false, 'SKIP')).toBe('minimal');
      expect(selectCardTier(0, false, 'SKIP')).toBe('minimal');
    });

    it('should ignore EXPLORE and BRIEF recommendations', () => {
      // EXPLORE and BRIEF should follow depth-based logic
      expect(selectCardTier(3, false, 'EXPLORE')).toBe('standard');
      expect(selectCardTier(10, false, 'BRIEF')).toBe('shallow');
    });

    it('should prioritize isInitialPosition over recommendation', () => {
      expect(selectCardTier(0, true, 'SKIP')).toBe('full');
    });
  });
});

describe('Card Tier Configurations', () => {
  it('should have decreasing depth across tiers', () => {
    expect(CARD_TIER_CONFIGS.full.engineDepth).toBeGreaterThan(
      CARD_TIER_CONFIGS.standard.engineDepth,
    );
    expect(CARD_TIER_CONFIGS.standard.engineDepth).toBeGreaterThan(
      CARD_TIER_CONFIGS.shallow.engineDepth,
    );
    expect(CARD_TIER_CONFIGS.shallow.engineDepth).toBeGreaterThanOrEqual(
      CARD_TIER_CONFIGS.minimal.engineDepth,
    );
  });

  it('should have decreasing multipv across tiers', () => {
    expect(CARD_TIER_CONFIGS.full.multipv).toBeGreaterThanOrEqual(
      CARD_TIER_CONFIGS.standard.multipv,
    );
    expect(CARD_TIER_CONFIGS.standard.multipv).toBeGreaterThanOrEqual(
      CARD_TIER_CONFIGS.shallow.multipv,
    );
    expect(CARD_TIER_CONFIGS.shallow.multipv).toBeGreaterThanOrEqual(
      CARD_TIER_CONFIGS.minimal.multipv,
    );
  });

  it('should include all features in full tier', () => {
    const full = CARD_TIER_CONFIGS.full;
    expect(full.includeClassicalFeatures).toBe(true);
    expect(full.includeReferenceGames).toBe(true);
    expect(full.includeMaia).toBe(true);
  });

  it('should exclude most features in minimal tier', () => {
    const minimal = CARD_TIER_CONFIGS.minimal;
    expect(minimal.includeClassicalFeatures).toBe(false);
    expect(minimal.includeReferenceGames).toBe(false);
    expect(minimal.includeMaia).toBe(false);
  });

  it('should have standard tier as a middle ground', () => {
    const standard = CARD_TIER_CONFIGS.standard;
    expect(standard.includeClassicalFeatures).toBe(true);
    expect(standard.includeReferenceGames).toBe(false); // Skip expensive DB lookup
    expect(standard.includeMaia).toBe(true);
  });

  it('should have valid depth values', () => {
    const tiers: CardTier[] = ['full', 'standard', 'shallow', 'minimal'];
    for (const tier of tiers) {
      expect(CARD_TIER_CONFIGS[tier].engineDepth).toBeGreaterThan(0);
      expect(CARD_TIER_CONFIGS[tier].engineDepth).toBeLessThanOrEqual(30);
    }
  });

  it('should have valid multipv values', () => {
    const tiers: CardTier[] = ['full', 'standard', 'shallow', 'minimal'];
    for (const tier of tiers) {
      expect(CARD_TIER_CONFIGS[tier].multipv).toBeGreaterThanOrEqual(1);
      expect(CARD_TIER_CONFIGS[tier].multipv).toBeLessThanOrEqual(5);
    }
  });
});
