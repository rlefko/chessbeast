/**
 * Theme Detection Module
 *
 * Provides deterministic detection of tactical and positional themes
 * in chess positions. These themes help the LLM understand position
 * characteristics and generate more insightful annotations.
 *
 * Usage:
 * ```typescript
 * import { TacticalThemeDetector, PositionalThemeDetector } from '@chessbeast/core';
 *
 * const tacticalDetector = new TacticalThemeDetector();
 * const positionalDetector = new PositionalThemeDetector();
 *
 * const tacticalThemes = tacticalDetector.detect(position);
 * const positionalThemes = positionalDetector.detect(position);
 * ```
 */

// Export types
export * from './types.js';

// Export utilities
export * from './utils/index.js';

// Tactical detectors
export * from './tactical/index.js';

// Positional detectors
export * from './positional/index.js';

/**
 * Helper function to convert detected themes to Motif array
 * for backward compatibility with Position Card
 */
import type { DetectedTheme, TacticalThemeId, PositionalThemeId } from './types.js';

/**
 * Map of theme IDs to legacy Motif strings
 * Some themes map to the same legacy motif
 */
const THEME_TO_MOTIF: Partial<Record<TacticalThemeId | PositionalThemeId, string>> = {
  // Tactical themes
  absolute_pin: 'pin',
  relative_pin: 'pin',
  cross_pin: 'pin',
  situational_pin: 'pin',
  knight_fork: 'fork',
  pawn_fork: 'fork',
  fork: 'fork',
  double_attack: 'double_attack',
  double_check: 'double_attack',
  skewer: 'skewer',
  x_ray_attack: 'skewer',
  x_ray_defense: 'skewer',
  discovered_attack: 'discovered_attack',
  discovered_check: 'discovered_attack',
  back_rank_weakness: 'back_rank_weakness',
  overloaded_piece: 'overloaded_piece',
  trapped_piece: 'trapped_piece',
  remove_defender: 'removal_of_guard',
  deflection: 'deflection',
  decoy: 'decoy',
  zwischenzug: 'zwischenzug',

  // Positional themes
  weak_pawn: 'weak_pawn',
  isolated_pawn: 'isolated_pawn',
  doubled_pawns: 'doubled_pawns',
  passed_pawn: 'passed_pawn',
  outpost: 'outpost',
  power_outpost: 'outpost',
  pseudo_outpost: 'outpost',
  open_file: 'open_file',
  semi_open_file: 'open_file',
  space_advantage: 'space_advantage',
  development_lead: 'development_lead',
  activity_advantage: 'piece_activity',
  piece_passivity: 'piece_activity',
};

/**
 * Convert detected themes to legacy Motif array
 * Removes duplicates and maintains order
 */
export function themesToMotifs(themes: DetectedTheme[]): string[] {
  const motifs: string[] = [];
  const seen = new Set<string>();

  for (const theme of themes) {
    const motif = THEME_TO_MOTIF[theme.id];
    if (motif && !seen.has(motif)) {
      seen.add(motif);
      motifs.push(motif);
    }
  }

  return motifs;
}

/**
 * Generate a summary string from detected themes
 */
export function generateThemeSummary(
  tactical: DetectedTheme[],
  positional: DetectedTheme[],
): string {
  const parts: string[] = [];

  // High-confidence tactical themes
  const criticalTactical = tactical.filter(
    (t) => t.confidence === 'high' || t.severity === 'critical',
  );
  if (criticalTactical.length > 0) {
    const descriptions = criticalTactical
      .slice(0, 3)
      .map((t) => t.explanation)
      .filter(Boolean);
    if (descriptions.length > 0) {
      parts.push(descriptions.join('. '));
    }
  }

  // Significant positional themes
  const significantPositional = positional.filter(
    (t) => t.severity === 'critical' || t.severity === 'significant',
  );
  if (significantPositional.length > 0) {
    const descriptions = significantPositional
      .slice(0, 2)
      .map((t) => t.explanation)
      .filter(Boolean);
    if (descriptions.length > 0) {
      parts.push(descriptions.join('. '));
    }
  }

  if (parts.length === 0) {
    return 'No significant themes detected.';
  }

  return parts.join(' ');
}
