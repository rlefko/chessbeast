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
  AlternativeCandidate,
  AlternativeCandidateConfig,
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

/**
 * Get default config for alternative candidate detection
 */
export function getAlternativeCandidateConfig(targetRating: number): AlternativeCandidateConfig {
  // Lower-rated players: higher thresholds (need more obvious alternatives)
  // Higher-rated players: can appreciate subtler alternatives
  const minProb = targetRating <= 1500 ? 0.2 : 0.15;
  const maxDelta = targetRating <= 1500 ? 150 : 100;

  return {
    targetRating,
    minMaiaProb: minProb,
    maxEvalDelta: maxDelta,
    maxCandidates: 3,
  };
}

/**
 * Detect alternative candidates worth considering for sideline exploration
 *
 * This is called AFTER add_move to identify moves that:
 * 1. Are human-likely (Maia probability above threshold)
 * 2. Are objectively reasonable (within eval threshold of best)
 * 3. Might be "attractive but bad" (high human prob but loses - perfect for refutation)
 *
 * The LLM uses its discretion to decide which are worth exploring.
 *
 * @param playedMove - The move that was just played (to exclude from alternatives)
 * @param engineCandidates - Engine candidate moves from multipv analysis
 * @param maiaPredictions - Maia predictions for the position
 * @param config - Configuration for detection thresholds
 * @returns Array of alternative candidates worth considering
 */
export function detectAlternativeCandidates(
  playedMove: string,
  engineCandidates: EngineCandidate[],
  maiaPredictions: MaiaPrediction[] | undefined,
  config: AlternativeCandidateConfig,
): AlternativeCandidate[] {
  if (engineCandidates.length < 2) {
    return [];
  }

  // Build Maia probability map
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
  const alternatives: AlternativeCandidate[] = [];
  const classConfig = getDefaultConfig(config.targetRating);

  // Process engine candidates (excluding the played move)
  for (const candidate of engineCandidates) {
    if (candidate.move === playedMove) {
      continue;
    }

    const humanProb = maiaMap.get(candidate.move);
    const evalDelta = Math.abs(candidate.evaluation - bestEval);

    // Determine if this candidate is worth considering
    let shouldInclude = false;
    let source: CandidateSource = 'quiet_improvement';
    let reason = '';

    // Check for attractive-but-bad (highest priority - shows refutation)
    if (isAttractiveBad(evalDelta, humanProb, classConfig)) {
      shouldInclude = true;
      source = 'attractive_but_bad';
      const probPercent = Math.round((humanProb ?? 0) * 100);
      reason = `tempting (${probPercent}% would play) but loses - show refutation`;
    }
    // Check if human-popular and reasonable
    else if (humanProb !== undefined && humanProb >= config.minMaiaProb) {
      if (evalDelta <= config.maxEvalDelta) {
        shouldInclude = true;
        if (candidate.move === topMaiaMove) {
          source = 'maia_preferred';
          reason = `human favorite (${Math.round(humanProb * 100)}%) - different approach`;
        } else {
          source = 'human_popular';
          reason = `popular choice (${Math.round(humanProb * 100)}%) - worth showing`;
        }
      }
    }
    // Check if objectively near-best (even without Maia data)
    else if (evalDelta <= config.maxEvalDelta / 2) {
      shouldInclude = true;
      source = 'near_best';
      reason = 'objectively strong alternative';
    }

    // Add tactical flags if applicable
    if (shouldInclude) {
      if (isCheck(candidate.move) && source !== 'attractive_but_bad') {
        source = 'scary_check';
        reason = reason ? `${reason}, gives check` : 'gives check - forcing';
      }
      if (isCapture(candidate.move) && source === 'quiet_improvement') {
        source = 'scary_capture';
        reason = reason ? `${reason}, capture` : 'capture - tactical';
      }

      alternatives.push({
        san: candidate.move,
        evaluation: candidate.evaluation,
        isMate: candidate.isMate,
        humanProbability: humanProb,
        source,
        reason,
      });
    }
  }

  // Also check Maia predictions not in engine top candidates
  // These might be attractive-but-bad moves worth refuting
  if (maiaPredictions) {
    for (const pred of maiaPredictions) {
      if (pred.san === playedMove) continue;
      if (alternatives.some((a) => a.san === pred.san)) continue;
      if (pred.probability < config.minMaiaProb) continue;

      // This is a human-popular move not in engine candidates
      // It's likely bad - worth showing as a refutation target
      if (pred.probability >= 0.2) {
        alternatives.push({
          san: pred.san,
          evaluation: 0, // Unknown - needs evaluation
          isMate: false,
          humanProbability: pred.probability,
          source: 'attractive_but_bad',
          reason: `${Math.round(pred.probability * 100)}% would play this - likely needs refutation`,
        });
      }
    }
  }

  // Sort by priority: attractive_but_bad first, then by human probability
  alternatives.sort((a, b) => {
    // Attractive-but-bad always first (best for refutations)
    if (a.source === 'attractive_but_bad' && b.source !== 'attractive_but_bad') return -1;
    if (b.source === 'attractive_but_bad' && a.source !== 'attractive_but_bad') return 1;
    // Then by human probability
    return (b.humanProbability ?? 0) - (a.humanProbability ?? 0);
  });

  return alternatives.slice(0, config.maxCandidates);
}
