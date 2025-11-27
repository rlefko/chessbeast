/**
 * Semantic matching utilities for LLM output validation
 */

import { expect } from 'vitest';

/**
 * Synonym mapping for chess terminology
 */
export const CHESS_SYNONYMS: Record<string, string[]> = {
  // Move quality terms
  sacrifice: ['sac', 'give up', 'offered', 'sacrificed', 'sacrificing', 'gives up'],
  blunder: ['mistake', 'error', 'oversight', 'gaffe', 'howler', 'terrible move'],
  brilliant: ['stunning', 'amazing', 'spectacular', 'beautiful', 'brilliant', 'masterful'],
  excellent: ['great', 'strong', 'very good', 'superb', 'fine'],
  inaccuracy: ['imprecise', 'slightly wrong', 'not the best', 'suboptimal'],

  // Tactical terms
  attack: ['assault', 'offensive', 'pressure', 'initiative', 'attacking', 'aggression'],
  defense: ['defend', 'defensive', 'protecting', 'guard', 'solid'],
  pin: ['pinned', 'pinning', 'pins'],
  fork: ['double attack', 'forking', 'forks', 'two pieces'],
  skewer: ['skewering', 'skewers'],
  discovered: ['discovery', 'discovered attack', 'discovers'],
  check: ['checking', 'checks', 'put in check'],
  checkmate: ['mate', 'mating', 'delivers mate'],
  castle: ['castling', 'castled', 'castles'],

  // Positional terms
  development: ['develop', 'developing', 'develops', 'piece activity'],
  center: ['central', 'centre', 'centralization'],
  control: ['controlling', 'controls', 'dominate', 'dominates'],
  weak: ['weakness', 'weakened', 'vulnerable'],
  strong: ['strength', 'powerful', 'solid'],
  space: ['spatial', 'space advantage'],
  pawn: ['pawn structure', 'pawns'],

  // Strategic terms
  endgame: ['ending', 'end game'],
  middlegame: ['middle game', 'middle-game'],
  opening: ['opening phase', 'opening stage'],
  plan: ['planning', 'strategy', 'idea'],
  material: ['piece', 'pieces', 'material advantage', 'material deficit'],
  advantage: ['edge', 'upper hand', 'better', 'winning'],
  disadvantage: ['worse', 'inferior', 'behind'],

  // Result terms
  win: ['winning', 'wins', 'victory', 'decisive'],
  draw: ['drawing', 'drawish', 'equal', 'balanced'],
  lose: ['losing', 'lost', 'defeat'],

  // King safety
  king: ['monarch', 'king safety', 'king position'],
  safe: ['safety', 'secure', 'protected'],
  exposed: ['unsafe', 'vulnerable', 'in danger'],
  walk: ['march', 'walking', 'journey'], // For king walks
};

/**
 * Normalize text for comparison
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if text contains a theme (with synonym matching)
 */
export function matchesTheme(text: string, theme: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedTheme = normalizeText(theme);

  // Direct match
  if (normalizedText.includes(normalizedTheme)) {
    return true;
  }

  // Synonym match
  const synonyms = CHESS_SYNONYMS[normalizedTheme];
  if (synonyms) {
    for (const synonym of synonyms) {
      if (normalizedText.includes(normalizeText(synonym))) {
        return true;
      }
    }
  }

  // Also check if the theme is in a synonym list
  for (const [key, synonymList] of Object.entries(CHESS_SYNONYMS)) {
    if (synonymList.some((s) => normalizeText(s) === normalizedTheme)) {
      if (
        normalizedText.includes(normalizeText(key)) ||
        synonymList.some((s) => normalizedText.includes(normalizeText(s)))
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Calculate the ratio of themes that match
 */
export function calculateThemeMatchRatio(text: string, themes: string[]): number {
  if (themes.length === 0) return 1;

  const matches = themes.filter((theme) => matchesTheme(text, theme));
  return matches.length / themes.length;
}

/**
 * Get which themes matched and which didn't
 */
export function getThemeMatches(
  text: string,
  themes: string[],
): { matched: string[]; missed: string[] } {
  const matched: string[] = [];
  const missed: string[] = [];

  for (const theme of themes) {
    if (matchesTheme(text, theme)) {
      matched.push(theme);
    } else {
      missed.push(theme);
    }
  }

  return { matched, missed };
}

/**
 * Assert that text contains expected themes with a minimum match ratio
 */
export function assertSemanticSimilarity(
  actual: string,
  expectedThemes: string[],
  minMatchRatio: number = 0.7,
): void {
  const ratio = calculateThemeMatchRatio(actual, expectedThemes);
  const { matched, missed } = getThemeMatches(actual, expectedThemes);

  if (ratio < minMatchRatio) {
    throw new Error(
      `Semantic match ratio ${ratio.toFixed(2)} is below minimum ${minMatchRatio}.\n` +
        `Matched themes: [${matched.join(', ')}]\n` +
        `Missed themes: [${missed.join(', ')}]\n` +
        `Text: "${actual.slice(0, 200)}${actual.length > 200 ? '...' : ''}"`,
    );
  }
}

/**
 * Vitest matcher for semantic similarity
 */
export function expectSemanticMatch(
  actual: string,
  expectedThemes: string[],
  minMatchRatio: number = 0.7,
): void {
  const ratio = calculateThemeMatchRatio(actual, expectedThemes);

  expect(ratio, `Expected ${expectedThemes.join(', ')} in text`).toBeGreaterThanOrEqual(
    minMatchRatio,
  );
}

/**
 * Check if annotation is coherent (basic checks)
 */
export function isAnnotationCoherent(text: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for basic sentence structure
  if (text.length > 0 && !/^[A-Z]/.test(text)) {
    issues.push('Annotation does not start with capital letter');
  }

  if (text.length > 5 && !/[.!?]$/.test(text.trim())) {
    issues.push('Annotation does not end with punctuation');
  }

  // Check for empty or very short annotations
  if (text.trim().length < 10) {
    issues.push('Annotation is too short');
  }

  // Check for repeated words (sign of generation issues)
  const words = text.toLowerCase().split(/\s+/);
  const wordCounts = new Map<string, number>();
  for (const word of words) {
    if (word.length > 3) {
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }
  }
  for (const [word, count] of wordCounts) {
    if (count > 5) {
      issues.push(`Word "${word}" repeated ${count} times`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Extract move references from annotation text
 * Looks for patterns like "Nf3", "exd5", "O-O"
 */
export function extractMoveReferences(text: string): string[] {
  const movePattern = /\b([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|O-O(?:-O)?)\b/g;
  const matches = text.match(movePattern);
  return matches ?? [];
}
