/**
 * Candidate Move Classifier
 *
 * Classifies candidate moves by their source/nature to help the LLM
 * understand WHY a move is interesting and decide how to explore it.
 */

import type {
  CandidateSource,
  ClassifiedCandidate,
  CandidateClassificationConfig,
} from './types.js';
import { CANDIDATE_SOURCE_PRIORITY, getAttractiveBadThresholds } from './types.js';

/**
 * Engine candidate from multipv analysis
 */
export interface EngineCandidate {
  move: string;
  evaluation: number;
  isMate: boolean;
  mateIn?: number;
  pv: string[];
}

/**
 * Maia prediction for a move
 */
export interface MaiaPrediction {
  san: string;
  probability: number;
}

/**
 * Check if a move gives check (from SAN notation)
 */
export function isCheck(san: string): boolean {
  return san.includes('+') || san.includes('#');
}

/**
 * Check if a move is a capture (from SAN notation)
 */
export function isCapture(san: string): boolean {
  return san.includes('x');
}

/**
 * Get the piece type from SAN notation
 */
export function getPieceType(san: string): string {
  const cleanSan = san.replace(/[+#x=]/g, '');
  if (cleanSan.startsWith('O-O')) {
    return 'k';
  }
  const firstChar = cleanSan.charAt(0);
  if (firstChar >= 'a' && firstChar <= 'h') {
    return 'p';
  }
  const pieceMap: Record<string, string> = { N: 'n', B: 'b', R: 'r', Q: 'q', K: 'k' };
  return pieceMap[firstChar] ?? 'p';
}

/**
 * Estimate material delta for a capture
 */
export function estimateMaterialDelta(san: string): number {
  if (!isCapture(san)) {
    return 0;
  }
  const capturingPiece = getPieceType(san);
  if (capturingPiece === 'p' && san.includes('=')) {
    return 300;
  }
  return 0;
}

/**
 * Check if a move is likely a sacrifice
 */
export function isSacrifice(
  move: string,
  evalBefore: number,
  evalAfter: number,
  materialDelta: number,
): boolean {
  if (!isCapture(move)) {
    return false;
  }
  const materialLoss = -materialDelta;
  const evalDrop = evalBefore - evalAfter;
  return materialLoss >= 100 && evalDrop < materialLoss * 0.5;
}

/**
 * Check if a move is "attractive but bad"
 */
export function isAttractiveBad(
  evalDelta: number,
  humanProb: number | undefined,
  config: CandidateClassificationConfig,
): boolean {
  if (humanProb === undefined) {
    return false;
  }
  const thresholds = getAttractiveBadThresholds(config.targetRating);
  const isAttractive = humanProb >= thresholds.minMaiaProb;
  const isBad = evalDelta >= thresholds.minEvalLoss;
  return isAttractive && isBad;
}

/**
 * Get the primary source from a list of sources
 */
export function getPrimarySource(sources: CandidateSource[]): CandidateSource {
  for (const prioritySource of CANDIDATE_SOURCE_PRIORITY) {
    if (sources.includes(prioritySource)) {
      return prioritySource;
    }
  }
  return 'quiet_improvement';
}

/**
 * Generate a human-readable reason for the source classification
 */
export function generateSourceReason(
  sources: CandidateSource[],
  humanProb?: number,
  evalDelta?: number,
): string {
  const parts: string[] = [];

  if (sources.includes('attractive_but_bad') && humanProb !== undefined) {
    const probPercent = Math.round(humanProb * 100);
    parts.push(`tempting (${probPercent}% would play) but loses`);
  } else if (sources.includes('engine_best')) {
    parts.push("engine's top choice");
  } else if (sources.includes('maia_preferred') && humanProb !== undefined) {
    const probPercent = Math.round(humanProb * 100);
    parts.push(`human favorite (${probPercent}%)`);
  } else if (sources.includes('near_best')) {
    parts.push('near-best alternative');
  } else if (sources.includes('human_popular') && humanProb !== undefined) {
    const probPercent = Math.round(humanProb * 100);
    parts.push(`popular choice (${probPercent}%)`);
  }

  if (sources.includes('sacrifice')) {
    parts.push('sacrifice');
  }
  if (sources.includes('scary_check')) {
    parts.push('gives check');
  }
  if (sources.includes('scary_capture')) {
    parts.push('capture');
  }
  if (sources.includes('blunder') && evalDelta !== undefined) {
    parts.push(`loses ${Math.round(evalDelta / 100)} pawns`);
  }

  if (parts.length === 0) {
    if (sources.includes('quiet_improvement')) {
      return 'positional improvement';
    }
    return 'alternative';
  }

  return parts.join(', ');
}

/**
 * Get default classification config for a rating
 */
export function getDefaultConfig(targetRating: number): CandidateClassificationConfig {
  const thresholds = getAttractiveBadThresholds(targetRating);
  return {
    targetRating,
    nearBestThreshold: 50,
    humanPopularThreshold: 0.15,
    attractiveBadThreshold: thresholds.minEvalLoss,
    blunderThreshold: 200,
  };
}

/**
 * Classify a list of candidate moves
 */
export function classifyCandidates(
  engineCandidates: EngineCandidate[],
  maiaPredictions: MaiaPrediction[] | undefined,
  config: CandidateClassificationConfig,
): ClassifiedCandidate[] {
  if (engineCandidates.length === 0) {
    return [];
  }

  const maiaMap = new Map<string, number>();
  let topMaiaMove: string | undefined;
  let topMaiaProb = 0;

  if (maiaPredictions && maiaPredictions.length > 0) {
    for (const pred of maiaPredictions) {
      maiaMap.set(pred.san, pred.probability);
      if (pred.probability > topMaiaProb) {
        topMaiaProb = pred.probability;
        topMaiaMove = pred.san;
      }
    }
  }

  const bestEval = engineCandidates[0]!.evaluation;

  return engineCandidates.map((candidate, index) => {
    const sources: CandidateSource[] = [];
    const humanProb = maiaMap.get(candidate.move);
    const evalDelta = candidate.evaluation - bestEval;

    if (index === 0) {
      sources.push('engine_best');
    } else if (Math.abs(evalDelta) <= config.nearBestThreshold) {
      sources.push('near_best');
    }

    if (humanProb !== undefined) {
      if (candidate.move === topMaiaMove) {
        sources.push('maia_preferred');
      }
      if (humanProb >= config.humanPopularThreshold) {
        sources.push('human_popular');
      }
    }

    if (isCheck(candidate.move)) {
      sources.push('scary_check');
    }
    if (isCapture(candidate.move)) {
      sources.push('scary_capture');
    }

    const materialDelta = estimateMaterialDelta(candidate.move);
    const evalLoss = Math.abs(evalDelta);

    if (isAttractiveBad(evalLoss, humanProb, config)) {
      sources.push('attractive_but_bad');
    }

    if (evalLoss >= config.blunderThreshold) {
      sources.push('blunder');
    }

    if (materialDelta < -100 && evalLoss < 50) {
      sources.push('sacrifice');
    }

    if (
      sources.length === 0 ||
      (sources.length === 1 && (sources.includes('near_best') || sources.includes('human_popular')))
    ) {
      if (!isCheck(candidate.move) && !isCapture(candidate.move)) {
        sources.push('quiet_improvement');
      }
    }

    const linePreview = candidate.pv.slice(0, 4).join(' ');

    const result: ClassifiedCandidate = {
      move: candidate.move,
      evaluation: candidate.evaluation,
      isMate: candidate.isMate,
      line: linePreview,
      sources,
      primarySource: getPrimarySource(sources),
      sourceReason: generateSourceReason(sources, humanProb, evalLoss),
    };

    // Add optional properties only if they have values
    if (candidate.mateIn !== undefined) {
      result.mateIn = candidate.mateIn;
    }
    if (humanProb !== undefined) {
      result.humanProbability = humanProb;
    }
    if (materialDelta !== 0) {
      result.materialDelta = materialDelta;
    }

    return result;
  });
}
