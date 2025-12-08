/**
 * Tactical Theme Detection
 *
 * Aggregates all tactical theme detectors into a unified interface.
 * Provides tiered detection for performance optimization.
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { DetectedTheme, DetectionConfig, DetectionTier } from '../types.js';

// Import individual detectors
import { detectBatteries } from './battery-detector.js';
import { detectDefenderTactics, detectDeflection } from './defender-detector.js';
import { detectDiscoveries, detectPotentialDiscoveries } from './discovery-detector.js';
import { detectForks, detectPotentialForks } from './fork-detector.js';
import { detectPawnTactics, detectUnderpromotion } from './pawn-tactics-detector.js';
import { detectPins, detectSituationalPins } from './pin-detector.js';
import { detectSkewers } from './skewer-detector.js';
import { detectWeaknesses, detectHangingPieces } from './weakness-detector.js';

/**
 * Detection tier configurations
 */
const TIER_CONFIG: Record<DetectionTier, { shallow: boolean; deep: boolean }> = {
  shallow: { shallow: true, deep: false },
  standard: { shallow: true, deep: false },
  full: { shallow: true, deep: true },
};

/**
 * TacticalThemeDetector - Main class for tactical theme detection
 *
 * Usage:
 * ```typescript
 * const detector = new TacticalThemeDetector();
 * const themes = detector.detect(position, { tier: 'full' });
 * ```
 */
export class TacticalThemeDetector {
  /**
   * Detect tactical themes in a position
   *
   * @param pos - Chess position to analyze
   * @param config - Detection configuration
   * @returns Array of detected themes
   */
  detect(pos: ChessPosition, config: DetectionConfig = {}): DetectedTheme[] {
    const tier = config.tier ?? 'standard';
    const tierConfig = TIER_CONFIG[tier];
    const themes: DetectedTheme[] = [];

    // === Tier 1: Fast, always-on detectors ===
    // These run in O(pieces) or O(1) time

    // Pin detection (O(sliding pieces * directions))
    themes.push(...detectPins(pos));

    // Fork detection - current forks (O(pieces))
    themes.push(...detectForks(pos));

    // Battery detection (O(pieces^2) but small constant)
    themes.push(...detectBatteries(pos));

    // Weakness detection (O(pieces))
    themes.push(...detectWeaknesses(pos));

    // Hanging pieces (O(pieces))
    themes.push(...detectHangingPieces(pos));

    // === Tier 2: Medium complexity ===
    // Run for standard and full tiers

    if (tier === 'standard' || tier === 'full') {
      // Skewer detection (O(sliding pieces * directions))
      themes.push(...detectSkewers(pos));

      // Discovery detection (O(sliding pieces * directions))
      themes.push(...detectDiscoveries(pos));

      // Defender tactics (O(pieces^2))
      themes.push(...detectDefenderTactics(pos));

      // Situational pins (O(sliding pieces * directions))
      themes.push(...detectSituationalPins(pos));

      // Pawn tactics (O(pawns))
      themes.push(...detectPawnTactics(pos));
    }

    // === Tier 3: Deep analysis (move simulation) ===
    // Only run for full tier - these are expensive

    if (tierConfig.deep) {
      // Potential forks (O(legal moves * pieces))
      themes.push(...detectPotentialForks(pos));

      // Potential discoveries (O(sliding pieces * directions * pieces))
      themes.push(...detectPotentialDiscoveries(pos));

      // Deflection opportunities (O(legal captures * pieces))
      themes.push(...detectDeflection(pos));

      // Underpromotion (O(promotion moves))
      themes.push(...detectUnderpromotion(pos));
    }

    // Sort by severity and confidence
    return this.sortAndDeduplicate(themes);
  }

  /**
   * Quick detection for shallow analysis
   * Only runs the fastest detectors
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
    // Severity order
    const severityOrder = { critical: 0, significant: 1, minor: 2 };

    // Confidence order
    const confidenceOrder = { high: 0, medium: 1, low: 2 };

    // Sort by severity, then confidence, then material
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

// Export individual detectors for direct use
export { detectPins, detectSituationalPins } from './pin-detector.js';
export { detectForks, detectPotentialForks } from './fork-detector.js';
export { detectSkewers } from './skewer-detector.js';
export { detectDiscoveries, detectPotentialDiscoveries } from './discovery-detector.js';
export { detectBatteries } from './battery-detector.js';
export { detectWeaknesses, detectHangingPieces } from './weakness-detector.js';
export { detectDefenderTactics, detectDeflection } from './defender-detector.js';
export { detectPawnTactics, detectUnderpromotion } from './pawn-tactics-detector.js';
