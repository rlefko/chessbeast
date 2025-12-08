/**
 * Rolling Summary
 *
 * Manages rolling summaries for line memory with smart pruning
 * and priority-based retention.
 */

import type { ThemeInstance, ThemeDelta } from '../themes/types.js';

import type { SummaryEntry, LineMemory, LineMemoryConfig } from './line-memory.js';
import { addSummaryEntry, DEFAULT_LINE_MEMORY_CONFIG } from './line-memory.js';

/**
 * Summary entry types with their default priorities
 */
export const SUMMARY_PRIORITIES: Record<SummaryEntry['type'], number> = {
  eval_swing: 4, // Highest priority - key turning points
  theme_emerged: 3, // Important for understanding
  structural_change: 3, // Pawn breaks, exchanges
  plan_shift: 2, // Strategic direction changes
  other: 1, // General information
};

/**
 * Create a summary entry for an eval swing
 */
export function createEvalSwingSummary(
  evalBefore: number,
  evalAfter: number,
  moveSan: string,
  isWhiteMove: boolean,
): Omit<SummaryEntry, 'ply'> {
  const diff = evalAfter - evalBefore;
  const direction = diff > 0 ? 'improves' : 'worsens';
  const absChange = Math.abs(diff);
  const side = isWhiteMove ? 'White' : 'Black';

  let description: string;
  if (absChange >= 300) {
    description = `${side}'s ${moveSan} ${direction} position significantly (${absChange >= 500 ? 'blunder' : 'mistake'})`;
  } else if (absChange >= 150) {
    description = `${side}'s ${moveSan} ${direction} position (inaccuracy)`;
  } else {
    description = `${side}'s ${moveSan} shifts evaluation`;
  }

  return {
    text: description,
    type: 'eval_swing',
    priority: absChange >= 300 ? 5 : SUMMARY_PRIORITIES.eval_swing,
  };
}

/**
 * Create a summary entry for theme emergence
 */
export function createThemeEmergenceSummary(theme: ThemeInstance): Omit<SummaryEntry, 'ply'> {
  const beneficiary = theme.beneficiary === 'w' ? 'White' : 'Black';
  const severity =
    theme.severity === 'critical'
      ? 'critical '
      : theme.severity === 'significant'
        ? 'significant '
        : '';

  return {
    text: `${severity}${theme.type.replace(/_/g, ' ')} emerges for ${beneficiary}`,
    type: 'theme_emerged',
    priority:
      theme.severity === 'critical'
        ? 5
        : theme.severity === 'significant'
          ? 4
          : SUMMARY_PRIORITIES.theme_emerged,
  };
}

/**
 * Create a summary entry for theme resolution
 */
export function createThemeResolutionSummary(theme: ThemeInstance): Omit<SummaryEntry, 'ply'> {
  return {
    text: `${theme.type.replace(/_/g, ' ')} resolved`,
    type: 'other',
    priority: 2,
  };
}

/**
 * Create a summary entry for structural change
 */
export function createStructuralChangeSummary(
  changeType: 'pawn_break' | 'exchange' | 'king_move' | 'castling' | 'promotion',
  details: string,
): Omit<SummaryEntry, 'ply'> {
  const descriptions: Record<string, string> = {
    pawn_break: `Pawn break: ${details}`,
    exchange: `Exchange: ${details}`,
    king_move: `King moves: ${details}`,
    castling: `Castling: ${details}`,
    promotion: `Promotion: ${details}`,
  };

  return {
    text: descriptions[changeType] ?? details,
    type: 'structural_change',
    priority: changeType === 'promotion' ? 5 : SUMMARY_PRIORITIES.structural_change,
  };
}

/**
 * Create a summary entry for plan shift
 */
export function createPlanShiftSummary(
  fromPlan: string,
  toPlan: string,
): Omit<SummaryEntry, 'ply'> {
  return {
    text: `Plan shifts from ${fromPlan} to ${toPlan}`,
    type: 'plan_shift',
    priority: SUMMARY_PRIORITIES.plan_shift,
  };
}

/**
 * Create a general summary entry
 */
export function createGeneralSummary(
  text: string,
  priority: number = SUMMARY_PRIORITIES.other,
): Omit<SummaryEntry, 'ply'> {
  return {
    text,
    type: 'other',
    priority,
  };
}

/**
 * Should add summary for eval swing?
 *
 * Returns true if the eval swing is significant enough to add to summary.
 */
export function shouldAddEvalSwingSummary(
  evalBefore: number,
  evalAfter: number,
  config: LineMemoryConfig = DEFAULT_LINE_MEMORY_CONFIG,
): boolean {
  const diff = Math.abs(evalAfter - evalBefore);
  return diff >= config.evalSwingThreshold;
}

/**
 * Should add summary for theme delta?
 *
 * Returns true if the theme change is significant enough to add to summary.
 */
export function shouldAddThemeSummary(delta: ThemeDelta): boolean {
  // Always add critical or significant themes
  if (delta.theme.severity === 'critical' || delta.theme.severity === 'significant') {
    return true;
  }

  // Add escalated themes
  if (delta.transition === 'escalated') {
    return true;
  }

  // Add emerged themes with high novelty
  if (delta.transition === 'emerged' && delta.theme.noveltyScore >= 0.8) {
    return true;
  }

  return false;
}

/**
 * Process theme deltas and add appropriate summaries
 */
export function processThemeDeltasForSummary(
  memory: LineMemory,
  deltas: ThemeDelta[],
  config: LineMemoryConfig = DEFAULT_LINE_MEMORY_CONFIG,
): void {
  for (const delta of deltas) {
    if (!shouldAddThemeSummary(delta)) {
      continue;
    }

    if (delta.transition === 'emerged' || delta.transition === 'escalated') {
      addSummaryEntry(memory, createThemeEmergenceSummary(delta.theme), config);
    } else if (delta.transition === 'resolved') {
      // Only add resolution for critical themes
      if (delta.theme.severity === 'critical') {
        addSummaryEntry(memory, createThemeResolutionSummary(delta.theme), config);
      }
    }
  }
}

/**
 * Compress similar summary entries
 *
 * Combines multiple similar entries into one to save space.
 */
export function compressSummary(memory: LineMemory): void {
  const entries = memory.rollingSummary;
  if (entries.length <= 3) return;

  // Group entries by type
  const byType = new Map<SummaryEntry['type'], SummaryEntry[]>();
  for (const entry of entries) {
    const existing = byType.get(entry.type) ?? [];
    existing.push(entry);
    byType.set(entry.type, existing);
  }

  // Compress each type if needed
  const compressed: SummaryEntry[] = [];

  for (const [type, typeEntries] of byType) {
    if (typeEntries.length <= 2) {
      compressed.push(...typeEntries);
      continue;
    }

    // Keep first and last, compress middle
    const first = typeEntries[0]!;
    const last = typeEntries[typeEntries.length - 1]!;

    if (type === 'eval_swing') {
      // For eval swings, summarize the overall trend
      const middleCount = typeEntries.length - 2;
      compressed.push(first);
      if (middleCount > 0) {
        compressed.push({
          ply: typeEntries[Math.floor(typeEntries.length / 2)]!.ply,
          text: `(${middleCount} more position changes)`,
          type: 'other',
          priority: 1,
        });
      }
      compressed.push(last);
    } else {
      // For other types, keep highest priority
      const sorted = [...typeEntries].sort((a, b) => b.priority - a.priority);
      compressed.push(...sorted.slice(0, 3));
    }
  }

  // Sort by ply
  compressed.sort((a, b) => a.ply - b.ply);
  memory.rollingSummary = compressed;
}

/**
 * Get summary as formatted string
 */
export function formatSummary(memory: LineMemory): string {
  if (memory.rollingSummary.length === 0) {
    return 'No significant events yet.';
  }

  return memory.rollingSummary.map((entry) => `• ${entry.text}`).join('\n');
}

/**
 * Get summary entries of a specific type
 */
export function getSummaryByType(memory: LineMemory, type: SummaryEntry['type']): SummaryEntry[] {
  return memory.rollingSummary.filter((entry) => entry.type === type);
}

/**
 * Get the most recent summary entry
 */
export function getLatestSummary(memory: LineMemory): SummaryEntry | undefined {
  if (memory.rollingSummary.length === 0) return undefined;
  return memory.rollingSummary[memory.rollingSummary.length - 1];
}

/**
 * Clear summary entries before a specific ply
 */
export function clearSummaryBefore(memory: LineMemory, ply: number): void {
  memory.rollingSummary = memory.rollingSummary.filter((entry) => entry.ply >= ply);
}
