/**
 * Positional Theme Detection
 *
 * Aggregates all positional theme detectors into a unified interface.
 * Provides tiered detection for performance optimization.
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, DetectionConfig } from '../types.js';

// Import individual detectors
import { detectActivityThemes } from './activity.js';
import { detectColorThemes } from './color-complex.js';
import { detectFileThemes, detectFileOperations } from './files.js';
import { detectOutposts, detectEntrySquares } from './outposts.js';
import { detectPawnStructure } from './pawn-structure.js';
import { detectSpaceThemes } from './space.js';

/**
 * PositionalThemeDetector - Main class for positional theme detection
 *
 * Usage:
 * ```typescript
 * const detector = new PositionalThemeDetector();
 * const themes = detector.detect(position, { tier: 'full' });
 * ```
 */
export class PositionalThemeDetector {
  /**
   * Detect positional themes in a position
   *
   * @param pos - Chess position to analyze
   * @param config - Detection configuration
   * @returns Array of detected themes
   */
  detect(pos: ChessPosition, config: DetectionConfig = {}): DetectedTheme[] {
    const tier = config.tier ?? 'standard';
    const themes: DetectedTheme[] = [];

    // === Tier 1: Fast, always-on detectors ===

    // Pawn structure (O(pawns))
    themes.push(...detectPawnStructure(pos));

    // File analysis (O(8))
    themes.push(...detectFileThemes(pos));

    // === Tier 2: Medium complexity ===
    // Run for standard and full tiers

    if (tier === 'standard' || tier === 'full') {
      // Outpost detection (O(64 * pawns))
      themes.push(...detectOutposts(pos));

      // Space analysis (O(64))
      themes.push(...detectSpaceThemes(pos));

      // Activity analysis (O(pieces * moves))
      themes.push(...detectActivityThemes(pos));
    }

    // === Tier 3: Deep analysis ===
    // Only run for full tier

    if (tier === 'full') {
      // Entry squares (O(8 * pieces))
      themes.push(...detectEntrySquares(pos));

      // File operations (O(rooks * 8))
      themes.push(...detectFileOperations(pos));

      // Color complex analysis
      themes.push(...detectColorThemes(pos));
    }

    // Sort by severity and confidence
    return this.sortAndDeduplicate(themes);
  }

  /**
   * Quick detection for shallow analysis
   */
  detectQuick(pos: ChessPosition): DetectedTheme[] {
    return this.detect(pos, { tier: 'shallow' });
  }

  /**
   * Full detection with all analysis
   */
  detectFull(pos: ChessPosition): DetectedTheme[] {
    return this.detect(pos, { tier: 'full' });
  }

  /**
   * Sort themes by importance and remove duplicates
   */
  private sortAndDeduplicate(themes: DetectedTheme[]): DetectedTheme[] {
    const severityOrder = { critical: 0, significant: 1, minor: 2 };
    const confidenceOrder = { high: 0, medium: 1, low: 2 };

    // Sort by severity, then confidence
    const sorted = themes.sort((a, b) => {
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;

      const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
      if (confDiff !== 0) return confDiff;

      return (b.materialAtStake ?? 0) - (a.materialAtStake ?? 0);
    });

    // Deduplicate by theme ID + primary square
    const seen = new Set<string>();
    const unique: DetectedTheme[] = [];

    for (const theme of sorted) {
      const primarySquare = theme.squares?.[0] ?? '';
      const key = `${theme.id}:${primarySquare}`;

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(theme);
      }
    }

    return unique;
  }
}

// Export individual detectors
export { detectPawnStructure } from './pawn-structure.js';
export { detectOutposts, detectEntrySquares } from './outposts.js';
export { detectFileThemes, detectFileOperations } from './files.js';
export { detectSpaceThemes } from './space.js';
export { detectActivityThemes } from './activity.js';
export { detectColorThemes } from './color-complex.js';
