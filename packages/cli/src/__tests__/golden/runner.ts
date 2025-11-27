/**
 * Golden test runner
 * Validates analysis output against expected criteria
 */

import type { GameAnalysis } from '@chessbeast/core';
import { calculateThemeMatchRatio, getThemeMatches } from '@chessbeast/test-utils';

import type { GoldenCriteria, GoldenResult, StructuralResult, SemanticResult } from './criteria.js';

/**
 * Run structural validation
 */
function validateStructural(analysis: GameAnalysis, criteria: GoldenCriteria): StructuralResult {
  const details: StructuralResult['details'] = {
    missingCriticalMoments: [],
    extraCriticalMoments: [],
    nagMismatches: [],
    classificationMismatches: [],
    blunderCountInRange: true,
    mistakeCountInRange: true,
    inaccuracyCountInRange: true,
  };

  // Check critical moments
  const actualCriticalPlies = new Set(analysis.criticalMoments.map((cm) => cm.plyIndex));
  const requiredCriticalPlies = new Set(criteria.structural.requiredCriticalMoments);

  for (const ply of requiredCriticalPlies) {
    if (!actualCriticalPlies.has(ply)) {
      details.missingCriticalMoments.push(ply);
    }
  }

  if (!criteria.tolerance.allowExtraCriticalMoments) {
    for (const ply of actualCriticalPlies) {
      if (!requiredCriticalPlies.has(ply)) {
        details.extraCriticalMoments.push(ply);
      }
    }
  }

  // Check classifications
  if (criteria.structural.expectedClassifications) {
    for (const { ply, classification } of criteria.structural.expectedClassifications) {
      const move = analysis.moves[ply];
      if (move && move.classification !== classification) {
        details.classificationMismatches.push({
          ply,
          expected: classification,
          actual: move.classification,
        });
      }
    }
  }

  // Check error counts
  const totalBlunders = analysis.stats.white.blunders + analysis.stats.black.blunders;
  const totalMistakes = analysis.stats.white.mistakes + analysis.stats.black.mistakes;
  const totalInaccuracies = analysis.stats.white.inaccuracies + analysis.stats.black.inaccuracies;

  details.blunderCountInRange =
    totalBlunders >= criteria.structural.blunderRange.min &&
    totalBlunders <= criteria.structural.blunderRange.max;

  details.mistakeCountInRange =
    totalMistakes >= criteria.structural.mistakeRange.min &&
    totalMistakes <= criteria.structural.mistakeRange.max;

  details.inaccuracyCountInRange =
    totalInaccuracies >= criteria.structural.inaccuracyRange.min &&
    totalInaccuracies <= criteria.structural.inaccuracyRange.max;

  // Determine pass/fail
  const passed =
    details.missingCriticalMoments.length === 0 &&
    details.extraCriticalMoments.length === 0 &&
    details.nagMismatches.length === 0 &&
    details.classificationMismatches.length === 0 &&
    details.blunderCountInRange &&
    details.mistakeCountInRange &&
    details.inaccuracyCountInRange;

  return { passed, details };
}

/**
 * Run semantic validation
 */
function validateSemantic(analysis: GameAnalysis, criteria: GoldenCriteria): SemanticResult {
  const details: SemanticResult['details'] = {
    summaryThemeMatch: 0,
    missingSummaryThemes: [],
    annotationThemeMatches: {},
    overallThemeMatch: 0,
  };

  // Check summary themes
  if (analysis.summary && criteria.semantic.summaryThemes.length > 0) {
    const { matched, missed } = getThemeMatches(analysis.summary, criteria.semantic.summaryThemes);
    details.summaryThemeMatch = matched.length / criteria.semantic.summaryThemes.length;
    details.missingSummaryThemes = missed;
  } else if (criteria.semantic.summaryThemes.length === 0) {
    details.summaryThemeMatch = 1; // No themes required = pass
  }

  // Check annotation themes
  let totalThemeMatches = 0;
  let totalExpectedThemes = 0;

  for (const [plyStr, themes] of Object.entries(criteria.semantic.annotationThemes)) {
    const ply = parseInt(plyStr, 10);
    const move = analysis.moves[ply];

    if (move?.comment && themes.length > 0) {
      const ratio = calculateThemeMatchRatio(move.comment, themes);
      const { missed } = getThemeMatches(move.comment, themes);

      details.annotationThemeMatches[ply] = { ratio, missed };
      totalThemeMatches += ratio * themes.length;
      totalExpectedThemes += themes.length;
    } else if (themes.length > 0) {
      details.annotationThemeMatches[ply] = { ratio: 0, missed: themes };
      totalExpectedThemes += themes.length;
    }
  }

  // Calculate overall theme match
  if (totalExpectedThemes > 0) {
    const summaryWeight = criteria.semantic.summaryThemes.length;
    const annotationWeight = totalExpectedThemes;
    const totalWeight = summaryWeight + annotationWeight;

    details.overallThemeMatch =
      (details.summaryThemeMatch * summaryWeight + totalThemeMatches) / totalWeight;
  } else {
    details.overallThemeMatch = details.summaryThemeMatch || 1;
  }

  // Determine pass/fail
  const passed = details.overallThemeMatch >= criteria.semantic.minThemeMatchRatio;

  return { passed, details };
}

/**
 * Run a complete golden test
 */
export function runGoldenTest(analysis: GameAnalysis, criteria: GoldenCriteria): GoldenResult {
  const structural = validateStructural(analysis, criteria);
  const semantic = validateSemantic(analysis, criteria);

  // Check opening match
  let openingMatch: boolean | undefined;
  if (criteria.opening) {
    if (criteria.opening.eco) {
      openingMatch = analysis.metadata.eco === criteria.opening.eco;
    }
    if (criteria.opening.name && analysis.metadata.openingName) {
      const nameMatch = analysis.metadata.openingName
        .toLowerCase()
        .includes(criteria.opening.name.toLowerCase());
      openingMatch = openingMatch === undefined ? nameMatch : openingMatch && nameMatch;
    }
  }

  // Check result match
  let resultMatch: boolean | undefined;
  if (criteria.result) {
    resultMatch = analysis.metadata.result === criteria.result;
  }

  // Overall pass/fail
  const passed =
    structural.passed &&
    semantic.passed &&
    (openingMatch === undefined || openingMatch) &&
    (resultMatch === undefined || resultMatch);

  return {
    passed,
    structural,
    semantic,
    openingMatch,
    resultMatch,
  };
}

/**
 * Generate a human-readable report from golden test result
 */
export function generateGoldenReport(caseName: string, result: GoldenResult): string {
  const lines: string[] = [
    `=== Golden Test: ${caseName} ===`,
    `Overall: ${result.passed ? 'PASSED' : 'FAILED'}`,
    '',
  ];

  // Structural results
  lines.push('--- Structural Validation ---');
  lines.push(`  Passed: ${result.structural.passed}`);

  if (result.structural.details.missingCriticalMoments.length > 0) {
    lines.push(
      `  Missing critical moments: ${result.structural.details.missingCriticalMoments.join(', ')}`,
    );
  }

  if (result.structural.details.extraCriticalMoments.length > 0) {
    lines.push(
      `  Extra critical moments: ${result.structural.details.extraCriticalMoments.join(', ')}`,
    );
  }

  if (result.structural.details.classificationMismatches.length > 0) {
    for (const m of result.structural.details.classificationMismatches) {
      lines.push(
        `  Classification mismatch at ply ${m.ply}: expected ${m.expected}, got ${m.actual}`,
      );
    }
  }

  lines.push(`  Blunder count in range: ${result.structural.details.blunderCountInRange}`);
  lines.push(`  Mistake count in range: ${result.structural.details.mistakeCountInRange}`);
  lines.push(`  Inaccuracy count in range: ${result.structural.details.inaccuracyCountInRange}`);

  // Semantic results
  lines.push('');
  lines.push('--- Semantic Validation ---');
  lines.push(`  Passed: ${result.semantic.passed}`);
  lines.push(
    `  Summary theme match: ${(result.semantic.details.summaryThemeMatch * 100).toFixed(1)}%`,
  );

  if (result.semantic.details.missingSummaryThemes.length > 0) {
    lines.push(
      `  Missing summary themes: ${result.semantic.details.missingSummaryThemes.join(', ')}`,
    );
  }

  lines.push(
    `  Overall theme match: ${(result.semantic.details.overallThemeMatch * 100).toFixed(1)}%`,
  );

  // Opening and result
  if (result.openingMatch !== undefined) {
    lines.push('');
    lines.push(`Opening match: ${result.openingMatch ? 'YES' : 'NO'}`);
  }

  if (result.resultMatch !== undefined) {
    lines.push(`Result match: ${result.resultMatch ? 'YES' : 'NO'}`);
  }

  return lines.join('\n');
}
