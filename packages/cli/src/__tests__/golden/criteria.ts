/**
 * Golden test criteria types and utilities
 */

import type { MoveClassification, CriticalMomentType } from '@chessbeast/core';

/**
 * Criteria for structural validation (strict matching)
 */
export interface StructuralCriteria {
  /** Ply indices that must be marked as critical moments */
  requiredCriticalMoments: number[];
  /** NAGs expected at specific ply indices */
  requiredNags: Record<number, string[]>;
  /** Expected range of blunders */
  blunderRange: { min: number; max: number };
  /** Expected range of mistakes */
  mistakeRange: { min: number; max: number };
  /** Expected range of inaccuracies */
  inaccuracyRange: { min: number; max: number };
  /** Specific move classifications to verify */
  expectedClassifications?: Array<{ ply: number; classification: MoveClassification }>;
  /** Expected critical moment types */
  expectedCriticalTypes?: Array<{ ply: number; type: CriticalMomentType }>;
}

/**
 * Criteria for semantic validation (flexible matching)
 */
export interface SemanticCriteria {
  /** Expected themes in game summary */
  summaryThemes: string[];
  /** Expected themes in annotations at specific plies */
  annotationThemes: Record<number, string[]>;
  /** Minimum theme match ratio (0-1) */
  minThemeMatchRatio: number;
}

/**
 * Tolerance settings for comparison
 */
export interface ToleranceSettings {
  /** Acceptable variance in cp loss calculation */
  cpLossTolerance: number;
  /** Allow extra annotations beyond required ones */
  allowExtraAnnotations: boolean;
  /** Allow extra critical moments beyond required ones */
  allowExtraCriticalMoments: boolean;
}

/**
 * Complete golden test criteria
 */
export interface GoldenCriteria {
  /** Test case name */
  name: string;
  /** Description of what the test validates */
  description: string;
  /** Structural validation criteria */
  structural: StructuralCriteria;
  /** Semantic validation criteria */
  semantic: SemanticCriteria;
  /** Tolerance settings */
  tolerance: ToleranceSettings;
  /** Expected opening identification */
  opening: {
    eco?: string;
    name?: string;
  } | undefined;
  /** Expected game result */
  result: string | undefined;
}

/**
 * Result of structural validation
 */
export interface StructuralResult {
  passed: boolean;
  details: {
    missingCriticalMoments: number[];
    extraCriticalMoments: number[];
    nagMismatches: Array<{ ply: number; expected: string[]; actual: string[] }>;
    classificationMismatches: Array<{
      ply: number;
      expected: MoveClassification;
      actual: MoveClassification;
    }>;
    blunderCountInRange: boolean;
    mistakeCountInRange: boolean;
    inaccuracyCountInRange: boolean;
  };
}

/**
 * Result of semantic validation
 */
export interface SemanticResult {
  passed: boolean;
  details: {
    summaryThemeMatch: number;
    missingSummaryThemes: string[];
    annotationThemeMatches: Record<number, { ratio: number; missed: string[] }>;
    overallThemeMatch: number;
  };
}

/**
 * Complete golden test result
 */
export interface GoldenResult {
  passed: boolean;
  structural: StructuralResult;
  semantic: SemanticResult;
  openingMatch: boolean | undefined;
  resultMatch: boolean | undefined;
}

/**
 * Default criteria values
 */
export const DEFAULT_CRITERIA: Omit<GoldenCriteria, 'name' | 'description'> = {
  structural: {
    requiredCriticalMoments: [],
    requiredNags: {},
    blunderRange: { min: 0, max: 10 },
    mistakeRange: { min: 0, max: 15 },
    inaccuracyRange: { min: 0, max: 20 },
  },
  semantic: {
    summaryThemes: [],
    annotationThemes: {},
    minThemeMatchRatio: 0.7,
  },
  tolerance: {
    cpLossTolerance: 20,
    allowExtraAnnotations: true,
    allowExtraCriticalMoments: true,
  },
  opening: undefined,
  result: undefined,
};

/**
 * Merge criteria with defaults
 */
export function mergeCriteria(partial: Partial<GoldenCriteria>): GoldenCriteria {
  return {
    name: partial.name ?? 'Unnamed Test',
    description: partial.description ?? '',
    structural: {
      ...DEFAULT_CRITERIA.structural,
      ...partial.structural,
    },
    semantic: {
      ...DEFAULT_CRITERIA.semantic,
      ...partial.semantic,
    },
    tolerance: {
      ...DEFAULT_CRITERIA.tolerance,
      ...partial.tolerance,
    },
    opening: partial.opening,
    result: partial.result,
  };
}
