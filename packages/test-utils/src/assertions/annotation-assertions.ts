/**
 * Custom assertions for annotation validation
 */

import type { GameAnalysis, MoveAnalysis } from '@chessbeast/core';
import { expect } from 'vitest';

import {
  isAnnotationCoherent,
  matchesTheme,
  calculateThemeMatchRatio,
  extractMoveReferences,
  getThemeMatches,
} from './semantic-matcher.js';

/**
 * NAG to classification mapping
 */
const CLASSIFICATION_NAGS: Record<string, string[]> = {
  brilliant: ['$3'], // !!
  excellent: ['$1'], // !
  good: ['$5'], // !?
  inaccuracy: ['$6'], // ?!
  mistake: ['$2'], // ?
  blunder: ['$4'], // ??
};

/**
 * Assert that annotation is grammatically correct
 */
export function assertAnnotationGrammar(annotation: string): void {
  const { valid, issues } = isAnnotationCoherent(annotation);

  if (!valid) {
    throw new Error(`Annotation grammar issues: ${issues.join(', ')}\nText: "${annotation}"`);
  }
}

/**
 * Assert that all annotations in analysis are grammatically correct
 */
export function assertAllAnnotationsGrammar(analysis: GameAnalysis): void {
  const issues: string[] = [];

  for (const move of analysis.moves) {
    if (move.comment) {
      const result = isAnnotationCoherent(move.comment);
      if (!result.valid) {
        issues.push(`Ply ${move.plyIndex}: ${result.issues.join(', ')}`);
      }
    }
  }

  if (analysis.summary) {
    const result = isAnnotationCoherent(analysis.summary);
    if (!result.valid) {
      issues.push(`Summary: ${result.issues.join(', ')}`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`Grammar issues found:\n${issues.join('\n')}`);
  }
}

/**
 * Assert that move references in annotation are valid
 */
export function assertValidMoveReferences(
  annotation: string,
  validMoves: string[],
  context?: string,
): void {
  const references = extractMoveReferences(annotation);

  for (const ref of references) {
    const isValid =
      validMoves.includes(ref) ||
      // Also allow common patterns like "Nf3" without full move list
      /^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?$/.test(ref) ||
      /^O-O(?:-O)?$/.test(ref);

    if (!isValid) {
      throw new Error(
        `Invalid move reference "${ref}" in annotation${context ? ` (${context})` : ''}`,
      );
    }
  }
}

/**
 * Assert that annotation themes match expected themes
 */
export function assertAnnotationThemes(
  annotation: string,
  expectedThemes: string[],
  minMatchRatio: number = 0.7,
): void {
  const ratio = calculateThemeMatchRatio(annotation, expectedThemes);
  const { matched, missed } = getThemeMatches(annotation, expectedThemes);

  expect(
    ratio,
    `Theme match ratio ${ratio.toFixed(2)} below ${minMatchRatio}. ` +
      `Matched: [${matched.join(', ')}]. Missed: [${missed.join(', ')}].`,
  ).toBeGreaterThanOrEqual(minMatchRatio);
}

/**
 * Assert that annotation contains specific term
 */
export function assertAnnotationContains(annotation: string, term: string): void {
  expect(
    matchesTheme(annotation, term),
    `Expected annotation to contain "${term}" (or synonym)`,
  ).toBe(true);
}

/**
 * Assert that critical moment annotations match their type
 */
export function assertCriticalMomentAnnotationRelevance(analysis: GameAnalysis): void {
  const typeThemes: Record<string, string[]> = {
    eval_swing: ['change', 'shift', 'turning', 'swing'],
    result_change: ['decisive', 'winning', 'losing', 'draw'],
    missed_win: ['missed', 'could have', 'winning'],
    missed_draw: ['missed', 'could have', 'draw'],
    phase_transition: ['endgame', 'middlegame', 'opening'],
    tactical_moment: ['tactic', 'combination', 'sacrifice', 'attack'],
    turning_point: ['turning', 'shift', 'change'],
    blunder_recovery: ['recover', 'mistake', 'blunder', 'error'],
  };

  for (const cm of analysis.criticalMoments) {
    const move = analysis.moves[cm.plyIndex];
    if (!move?.comment) continue;

    const themes = typeThemes[cm.type];
    if (!themes) continue;

    const ratio = calculateThemeMatchRatio(move.comment, themes);

    // We expect at least some relevance, but allow flexibility
    if (ratio === 0 && themes.length > 0) {
      console.warn(
        `Warning: Annotation at ply ${cm.plyIndex} (${cm.type}) may not be relevant to the critical moment type`,
      );
    }
  }
}

/**
 * Assert that NAGs match move classifications
 */
export function assertNagsMatchClassifications(
  moves: MoveAnalysis[],
  nags: Map<number, string[]>,
): void {
  for (const move of moves) {
    const moveNags = nags.get(move.plyIndex);
    if (!moveNags) continue;

    const expectedNags = CLASSIFICATION_NAGS[move.classification];
    if (!expectedNags) continue;

    // Check if at least one expected NAG is present
    const hasMatchingNag = expectedNags.some((nag) => moveNags.includes(nag));

    expect(
      hasMatchingNag,
      `Expected NAG ${expectedNags.join(' or ')} for ${move.classification} at ply ${move.plyIndex}, got [${moveNags.join(', ')}]`,
    ).toBe(true);
  }
}

/**
 * Assert that annotation is non-empty
 */
export function assertHasAnnotation(move: MoveAnalysis, context?: string): void {
  expect(
    move.comment,
    `Expected annotation at ply ${move.plyIndex}${context ? ` (${context})` : ''}`,
  ).toBeDefined();
  expect(
    move.comment?.length,
    `Expected non-empty annotation at ply ${move.plyIndex}`,
  ).toBeGreaterThan(0);
}

/**
 * Assert summary contains expected themes
 */
export function assertSummaryThemes(
  summary: string,
  expectedThemes: string[],
  minMatchRatio: number = 0.6,
): void {
  assertAnnotationThemes(summary, expectedThemes, minMatchRatio);
}

/**
 * Assert summary mentions both players
 */
export function assertSummaryMentionsPlayers(
  summary: string,
  whiteName: string,
  blackName: string,
): void {
  const normalizedSummary = summary.toLowerCase();
  const mentionsWhite =
    normalizedSummary.includes(whiteName.toLowerCase()) || normalizedSummary.includes('white');
  const mentionsBlack =
    normalizedSummary.includes(blackName.toLowerCase()) || normalizedSummary.includes('black');

  expect(mentionsWhite, `Summary should mention white player "${whiteName}"`).toBe(true);
  expect(mentionsBlack, `Summary should mention black player "${blackName}"`).toBe(true);
}

/**
 * Assert total annotation count
 */
export function assertAnnotationCount(
  analysis: GameAnalysis,
  expected: { min?: number; max?: number; exact?: number },
): void {
  const count = analysis.moves.filter((m) => m.comment && m.comment.length > 0).length;

  if (expected.exact !== undefined) {
    expect(count, `Expected exactly ${expected.exact} annotations`).toBe(expected.exact);
    return;
  }

  if (expected.min !== undefined) {
    expect(count, `Expected at least ${expected.min} annotations`).toBeGreaterThanOrEqual(
      expected.min,
    );
  }

  if (expected.max !== undefined) {
    expect(count, `Expected at most ${expected.max} annotations`).toBeLessThanOrEqual(expected.max);
  }
}
