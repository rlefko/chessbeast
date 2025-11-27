/**
 * Quality metrics collection framework
 */

import type { MoveClassification } from '@chessbeast/core';
import { calculateThemeMatchRatio } from '../assertions/semantic-matcher.js';

/**
 * Blunder detection metrics
 */
export interface BlunderDetectionMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
}

/**
 * Move classification accuracy metrics
 */
export interface ClassificationAccuracy {
  byClassification: Record<
    MoveClassification,
    {
      correct: number;
      total: number;
      accuracy: number;
    }
  >;
  overall: {
    correct: number;
    total: number;
    accuracy: number;
  };
}

/**
 * Opening identification metrics
 */
export interface OpeningIdentificationMetrics {
  correctEco: number;
  correctName: number;
  totalGames: number;
  ecoAccuracy: number;
  nameAccuracy: number;
}

/**
 * Annotation coherence metrics
 */
export interface AnnotationCoherenceMetrics {
  averageThemeMatch: number;
  grammaticallyCorrect: number;
  totalAnnotations: number;
  coherenceRate: number;
}

/**
 * Complete quality metrics
 */
export interface QualityMetrics {
  blunderDetection: BlunderDetectionMetrics;
  classificationAccuracy: ClassificationAccuracy;
  openingIdentification: OpeningIdentificationMetrics;
  annotationCoherence: AnnotationCoherenceMetrics;
}

/**
 * Metrics collector for quality validation tests
 */
export class MetricsCollector {
  private blunderData: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
  } = { truePositives: 0, falsePositives: 0, falseNegatives: 0 };

  private classificationData: Map<
    MoveClassification,
    { correct: number; total: number }
  > = new Map();

  private openingData = {
    correctEco: 0,
    correctName: 0,
    totalGames: 0,
  };

  private annotationData = {
    themeMatchSum: 0,
    grammaticallyCorrect: 0,
    totalAnnotations: 0,
  };

  /**
   * Record blunder detection results
   */
  recordBlunderDetection(predictedPlies: number[], groundTruthPlies: number[]): void {
    const predictedSet = new Set(predictedPlies);
    const groundTruthSet = new Set(groundTruthPlies);

    // True positives: predicted and in ground truth
    for (const ply of predictedPlies) {
      if (groundTruthSet.has(ply)) {
        this.blunderData.truePositives++;
      } else {
        this.blunderData.falsePositives++;
      }
    }

    // False negatives: in ground truth but not predicted
    for (const ply of groundTruthPlies) {
      if (!predictedSet.has(ply)) {
        this.blunderData.falseNegatives++;
      }
    }
  }

  /**
   * Record move classification result
   */
  recordClassification(predicted: MoveClassification, actual: MoveClassification): void {
    const data = this.classificationData.get(actual) ?? { correct: 0, total: 0 };
    data.total++;
    if (predicted === actual) {
      data.correct++;
    }
    this.classificationData.set(actual, data);
  }

  /**
   * Record opening identification result
   */
  recordOpeningMatch(predictedEco: string | undefined, actualEco: string): void {
    this.openingData.totalGames++;

    if (predictedEco === actualEco) {
      this.openingData.correctEco++;
    }
  }

  /**
   * Record opening name match
   */
  recordOpeningNameMatch(predictedName: string | undefined, actualName: string): void {
    if (predictedName && actualName) {
      const normalizedPredicted = predictedName.toLowerCase();
      const normalizedActual = actualName.toLowerCase();

      if (
        normalizedPredicted.includes(normalizedActual) ||
        normalizedActual.includes(normalizedPredicted)
      ) {
        this.openingData.correctName++;
      }
    }
  }

  /**
   * Record annotation coherence
   */
  recordAnnotationCoherence(
    annotation: string,
    expectedThemes: string[],
    isGrammaticallyCorrect: boolean,
  ): void {
    this.annotationData.totalAnnotations++;

    const themeMatchRatio = calculateThemeMatchRatio(annotation, expectedThemes);
    this.annotationData.themeMatchSum += themeMatchRatio;

    if (isGrammaticallyCorrect) {
      this.annotationData.grammaticallyCorrect++;
    }
  }

  /**
   * Calculate precision, recall, and F1
   */
  private calculatePRF(): { precision: number; recall: number; f1: number } {
    const { truePositives, falsePositives, falseNegatives } = this.blunderData;

    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1 = (2 * precision * recall) / (precision + recall) || 0;

    return { precision, recall, f1 };
  }

  /**
   * Get all collected metrics
   */
  getMetrics(): QualityMetrics {
    const { precision, recall, f1 } = this.calculatePRF();

    // Build classification accuracy
    const classifications: MoveClassification[] = [
      'book',
      'excellent',
      'good',
      'inaccuracy',
      'mistake',
      'blunder',
      'brilliant',
      'forced',
    ];

    const byClassification: ClassificationAccuracy['byClassification'] = {} as Record<
      MoveClassification,
      { correct: number; total: number; accuracy: number }
    >;

    let totalCorrect = 0;
    let totalCount = 0;

    for (const classification of classifications) {
      const data = this.classificationData.get(classification) ?? { correct: 0, total: 0 };
      byClassification[classification] = {
        correct: data.correct,
        total: data.total,
        accuracy: data.total > 0 ? data.correct / data.total : 0,
      };
      totalCorrect += data.correct;
      totalCount += data.total;
    }

    return {
      blunderDetection: {
        truePositives: this.blunderData.truePositives,
        falsePositives: this.blunderData.falsePositives,
        falseNegatives: this.blunderData.falseNegatives,
        precision,
        recall,
        f1Score: f1,
      },
      classificationAccuracy: {
        byClassification,
        overall: {
          correct: totalCorrect,
          total: totalCount,
          accuracy: totalCount > 0 ? totalCorrect / totalCount : 0,
        },
      },
      openingIdentification: {
        correctEco: this.openingData.correctEco,
        correctName: this.openingData.correctName,
        totalGames: this.openingData.totalGames,
        ecoAccuracy:
          this.openingData.totalGames > 0
            ? this.openingData.correctEco / this.openingData.totalGames
            : 0,
        nameAccuracy:
          this.openingData.totalGames > 0
            ? this.openingData.correctName / this.openingData.totalGames
            : 0,
      },
      annotationCoherence: {
        averageThemeMatch:
          this.annotationData.totalAnnotations > 0
            ? this.annotationData.themeMatchSum / this.annotationData.totalAnnotations
            : 0,
        grammaticallyCorrect: this.annotationData.grammaticallyCorrect,
        totalAnnotations: this.annotationData.totalAnnotations,
        coherenceRate:
          this.annotationData.totalAnnotations > 0
            ? this.annotationData.grammaticallyCorrect / this.annotationData.totalAnnotations
            : 0,
      },
    };
  }

  /**
   * Generate a human-readable report
   */
  generateReport(): string {
    const metrics = this.getMetrics();
    const lines: string[] = [
      '=== Quality Metrics Report ===',
      '',
      '--- Blunder Detection ---',
      `True Positives:  ${metrics.blunderDetection.truePositives}`,
      `False Positives: ${metrics.blunderDetection.falsePositives}`,
      `False Negatives: ${metrics.blunderDetection.falseNegatives}`,
      `Precision: ${(metrics.blunderDetection.precision * 100).toFixed(1)}%`,
      `Recall:    ${(metrics.blunderDetection.recall * 100).toFixed(1)}%`,
      `F1 Score:  ${(metrics.blunderDetection.f1Score * 100).toFixed(1)}%`,
      '',
      '--- Classification Accuracy ---',
      `Overall: ${(metrics.classificationAccuracy.overall.accuracy * 100).toFixed(1)}% (${metrics.classificationAccuracy.overall.correct}/${metrics.classificationAccuracy.overall.total})`,
    ];

    for (const [classification, data] of Object.entries(
      metrics.classificationAccuracy.byClassification,
    )) {
      if (data.total > 0) {
        lines.push(
          `  ${classification}: ${(data.accuracy * 100).toFixed(1)}% (${data.correct}/${data.total})`,
        );
      }
    }

    lines.push(
      '',
      '--- Opening Identification ---',
      `ECO Accuracy:  ${(metrics.openingIdentification.ecoAccuracy * 100).toFixed(1)}% (${metrics.openingIdentification.correctEco}/${metrics.openingIdentification.totalGames})`,
      `Name Accuracy: ${(metrics.openingIdentification.nameAccuracy * 100).toFixed(1)}% (${metrics.openingIdentification.correctName}/${metrics.openingIdentification.totalGames})`,
      '',
      '--- Annotation Coherence ---',
      `Average Theme Match: ${(metrics.annotationCoherence.averageThemeMatch * 100).toFixed(1)}%`,
      `Grammatically Correct: ${metrics.annotationCoherence.grammaticallyCorrect}/${metrics.annotationCoherence.totalAnnotations}`,
      `Coherence Rate: ${(metrics.annotationCoherence.coherenceRate * 100).toFixed(1)}%`,
    );

    return lines.join('\n');
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.blunderData = { truePositives: 0, falsePositives: 0, falseNegatives: 0 };
    this.classificationData.clear();
    this.openingData = { correctEco: 0, correctName: 0, totalGames: 0 };
    this.annotationData = { themeMatchSum: 0, grammaticallyCorrect: 0, totalAnnotations: 0 };
  }
}

/**
 * Create a new metrics collector
 */
export function createMetricsCollector(): MetricsCollector {
  return new MetricsCollector();
}
