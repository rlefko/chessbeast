/**
 * Agent Card Builder
 *
 * Builds compact agent cards from position analysis data.
 * Handles summarization of themes, candidates, and line memory
 * to minimize token usage while preserving essential context.
 */

import type { CriticalityScore } from '@chessbeast/core';
import type { CandidateMove } from '@chessbeast/core/storage';

import type { LineMemory } from '../memory/line-memory.js';
import {
  getEvalTrendDirection,
  getUnexplainedThemes,
  getSummaryBullets,
} from '../memory/line-memory.js';
import type { CommentIntent } from '../narration/intents.js';
import type { ThemeDelta } from '../themes/types.js';

import type {
  AgentCard,
  CandidateSummary,
  CompactEval,
  LineContextSnapshot,
  OutputConstraints,
  ParentDelta,
  ThemeDeltaSummary,
  WDL,
} from './types.js';

/**
 * Maximum number of theme deltas to include
 */
const MAX_THEME_DELTAS = 5;

/**
 * Maximum number of candidates to include
 */
const MAX_CANDIDATES = 6;

/**
 * Maximum summary bullets to include
 */
const MAX_SUMMARY_BULLETS = 5;

/**
 * Maximum PV preview moves
 */
const MAX_PV_PREVIEW = 3;

/**
 * Builder configuration
 */
export interface AgentCardBuilderConfig {
  /** Maximum theme deltas to include (default: 5) */
  maxThemeDeltas: number;

  /** Maximum candidates to include (default: 6) */
  maxCandidates: number;

  /** Maximum summary bullets (default: 5) */
  maxSummaryBullets: number;

  /** Maximum PV preview moves (default: 3) */
  maxPvPreview: number;
}

/**
 * Default builder configuration
 */
export const DEFAULT_BUILDER_CONFIG: AgentCardBuilderConfig = {
  maxThemeDeltas: MAX_THEME_DELTAS,
  maxCandidates: MAX_CANDIDATES,
  maxSummaryBullets: MAX_SUMMARY_BULLETS,
  maxPvPreview: MAX_PV_PREVIEW,
};

/**
 * Input for building an agent card
 */
export interface AgentCardInput {
  /** Position key */
  positionKey: string;

  /** FEN string */
  fen: string;

  /** Ply number */
  ply: number;

  /** Evaluation result */
  eval: {
    cp?: number;
    mate?: number;
    wdl?: { win: number; draw: number; loss: number };
  };

  /** Criticality score */
  criticalityScore: CriticalityScore;

  /** Candidate moves */
  candidates: CandidateMove[];

  /** Theme deltas (emerged/escalated) */
  themeDeltas?: ThemeDelta[];

  /** Line memory for context */
  lineMemory?: LineMemory;

  /** Parent position data for delta calculation */
  parentData?: {
    move: string;
    evalCp: number;
    winProb: number;
  };

  /** Current position win probability */
  currentWinProb?: number;

  /** NAG annotation */
  nag?: string;

  /** Output constraints */
  constraints?: Partial<OutputConstraints>;
}

/**
 * Agent Card Builder
 *
 * Creates compact agent cards for LLM input.
 */
export class AgentCardBuilder {
  private readonly config: AgentCardBuilderConfig;

  constructor(config: Partial<AgentCardBuilderConfig> = {}) {
    this.config = { ...DEFAULT_BUILDER_CONFIG, ...config };
  }

  /**
   * Build an agent card from input data
   */
  build(input: AgentCardInput): AgentCard {
    const sideToMove = this.extractSideToMove(input.fen);

    // Build evaluation
    const evalData = this.buildEval(input.eval);

    // Build WDL if available
    const wdl = input.eval.wdl !== undefined ? this.buildWDL(input.eval.wdl) : undefined;

    // Build parent delta if available
    const parentDelta =
      input.parentData !== undefined && input.currentWinProb !== undefined
        ? this.buildParentDelta(input.parentData, input.eval.cp ?? 0, input.currentWinProb)
        : undefined;

    // Summarize theme deltas
    const themeDeltas = this.summarizeThemeDeltas(input.themeDeltas ?? []);

    // Summarize candidates
    const candidates = this.summarizeCandidates(input.candidates);

    // Build line context
    const lineContext = this.buildLineContext(input.lineMemory, input.ply);

    // Build constraints
    const constraints = this.buildConstraints(input.constraints);

    const card: AgentCard = {
      positionKey: input.positionKey,
      fen: input.fen,
      ply: input.ply,
      sideToMove,
      eval: evalData,
      criticalityScore: input.criticalityScore.score,
      themeDeltas,
      candidates,
      lineContext,
      constraints,
    };

    // Add optional fields
    if (wdl !== undefined) {
      card.wdl = wdl;
    }
    if (input.nag !== undefined) {
      card.nag = input.nag;
    }
    if (parentDelta !== undefined) {
      card.parentDelta = parentDelta;
    }

    return card;
  }

  /**
   * Build an agent card from a comment intent
   *
   * Convenience method for narrator integration.
   */
  buildFromIntent(
    intent: CommentIntent,
    input: Omit<AgentCardInput, 'ply' | 'criticalityScore'> & {
      criticalityScore?: CriticalityScore;
    },
  ): AgentCard {
    // Create a minimal criticality score if not provided
    const criticalityScore: CriticalityScore = input.criticalityScore ?? {
      score: intent.scoreBreakdown.criticality * 100,
      factors: {
        winProbDelta: 0,
        cpDelta: 0,
        tacticalVolatility: 0,
        themeNovelty: intent.scoreBreakdown.themeNovelty,
        kingSafetyRisk: 0,
        repetitionPenalty: intent.scoreBreakdown.redundancyPenalty,
      },
      recommendedTier: 'standard',
      reason: 'from intent',
    };

    // Use theme deltas from intent if not provided
    const themeDeltas = input.themeDeltas ?? intent.themeDeltas;

    // Build base input
    const buildInput: AgentCardInput = {
      ...input,
      ply: intent.plyIndex,
      criticalityScore,
    };

    // Only add themeDeltas if defined (exactOptionalPropertyTypes compatibility)
    if (themeDeltas !== undefined) {
      buildInput.themeDeltas = themeDeltas;
    }

    return this.build(buildInput);
  }

  /**
   * Extract side to move from FEN
   */
  private extractSideToMove(fen: string): 'w' | 'b' {
    const parts = fen.split(' ');
    return parts[1] === 'b' ? 'b' : 'w';
  }

  /**
   * Build compact evaluation
   */
  private buildEval(evalInput: { cp?: number; mate?: number }): CompactEval {
    const result: CompactEval = {};

    if (evalInput.mate !== undefined) {
      result.mate = evalInput.mate;
    } else if (evalInput.cp !== undefined) {
      result.cp = evalInput.cp;
    }

    return result;
  }

  /**
   * Build WDL probabilities
   */
  private buildWDL(wdl: { win: number; draw: number; loss: number }): WDL {
    return {
      win: Math.round(wdl.win * 100) / 100,
      draw: Math.round(wdl.draw * 100) / 100,
      loss: Math.round(wdl.loss * 100) / 100,
    };
  }

  /**
   * Build parent delta
   */
  private buildParentDelta(
    parentData: { move: string; evalCp: number; winProb: number },
    currentEvalCp: number,
    currentWinProb: number,
  ): ParentDelta {
    return {
      move: parentData.move,
      evalChange: currentEvalCp - parentData.evalCp,
      winProbChange: Math.round((currentWinProb - parentData.winProb) * 10) / 10,
    };
  }

  /**
   * Summarize theme deltas for compact representation
   *
   * Only includes emerged/escalated themes, limited to maxThemeDeltas.
   */
  summarizeThemeDeltas(deltas: ThemeDelta[]): ThemeDeltaSummary[] {
    // Filter to only emerged/escalated
    const relevant = deltas.filter(
      (d) => d.transition === 'emerged' || d.transition === 'escalated',
    );

    // Sort by severity (critical first) then by material at stake
    const sorted = [...relevant].sort((a, b) => {
      const severityOrder = { critical: 0, significant: 1, moderate: 2, minor: 3 };
      const aSeverity = severityOrder[a.theme.severity] ?? 4;
      const bSeverity = severityOrder[b.theme.severity] ?? 4;

      if (aSeverity !== bSeverity) return aSeverity - bSeverity;

      const aMaterial = a.theme.materialAtStake ?? 0;
      const bMaterial = b.theme.materialAtStake ?? 0;
      return bMaterial - aMaterial;
    });

    // Take top N
    return sorted
      .slice(0, this.config.maxThemeDeltas)
      .map((delta) => this.summarizeThemeDelta(delta));
  }

  /**
   * Summarize a single theme delta
   */
  private summarizeThemeDelta(delta: ThemeDelta): ThemeDeltaSummary {
    const summary: ThemeDeltaSummary = {
      type: delta.theme.type,
      category: delta.theme.category,
      beneficiary: delta.theme.beneficiary,
      square: delta.theme.primarySquare,
      severity: delta.theme.severity,
      transition: delta.transition,
      explanation: delta.theme.explanation,
    };

    if (delta.theme.materialAtStake !== undefined) {
      summary.materialAtStake = delta.theme.materialAtStake;
    }

    return summary;
  }

  /**
   * Summarize candidates for compact representation
   */
  summarizeCandidates(candidates: CandidateMove[]): CandidateSummary[] {
    // Sort by priority (using source priority)
    const sorted = [...candidates].sort((a, b) => {
      // Engine best first
      if (a.primarySource === 'engine_best' && b.primarySource !== 'engine_best') return -1;
      if (b.primarySource === 'engine_best' && a.primarySource !== 'engine_best') return 1;

      // Then by eval
      return b.evalCp - a.evalCp;
    });

    // Take top N
    return sorted.slice(0, this.config.maxCandidates).map((c) => this.summarizeCandidate(c));
  }

  /**
   * Summarize a single candidate
   */
  private summarizeCandidate(candidate: CandidateMove): CandidateSummary {
    const summary: CandidateSummary = {
      san: candidate.san,
      evalCp: candidate.evalCp,
      source: candidate.primarySource,
      reason: candidate.sourceReason,
    };

    if (candidate.mate !== undefined) {
      summary.mate = candidate.mate;
    }

    if (candidate.maiaProbability !== undefined) {
      summary.humanProb = Math.round(candidate.maiaProbability * 100) / 100;
    }

    if (candidate.pvPreview.length > 0) {
      summary.pvPreview = candidate.pvPreview.slice(0, this.config.maxPvPreview);
    }

    return summary;
  }

  /**
   * Build line context snapshot
   */
  buildLineContext(lineMemory: LineMemory | undefined, currentPly: number): LineContextSnapshot {
    if (lineMemory === undefined) {
      return {
        ply: currentPly,
        recentSummary: [],
        evalTrend: 'stable',
        unexplainedThemeCount: 0,
      };
    }

    const bullets = getSummaryBullets(lineMemory);
    const recentSummary = bullets.slice(-this.config.maxSummaryBullets);
    const unexplainedThemes = getUnexplainedThemes(lineMemory);

    const context: LineContextSnapshot = {
      ply: lineMemory.currentPly,
      recentSummary,
      evalTrend: getEvalTrendDirection(lineMemory),
      unexplainedThemeCount: unexplainedThemes.length,
    };

    if (lineMemory.narrativeFocus !== undefined) {
      context.focus = lineMemory.narrativeFocus;
    }

    return context;
  }

  /**
   * Build output constraints
   */
  private buildConstraints(partial?: Partial<OutputConstraints>): OutputConstraints {
    const defaults: OutputConstraints = {
      maxWords: 50,
      style: 'concise',
      audience: 'club',
      includeVariations: true,
      showEvaluations: false,
    };

    return { ...defaults, ...partial };
  }
}

/**
 * Create an agent card builder
 */
export function createAgentCardBuilder(config?: Partial<AgentCardBuilderConfig>): AgentCardBuilder {
  return new AgentCardBuilder(config);
}

/**
 * Summarize a theme delta for compact representation
 *
 * Standalone function for direct use.
 */
export function summarizeThemeDelta(delta: ThemeDelta): ThemeDeltaSummary {
  const summary: ThemeDeltaSummary = {
    type: delta.theme.type,
    category: delta.theme.category,
    beneficiary: delta.theme.beneficiary,
    square: delta.theme.primarySquare,
    severity: delta.theme.severity,
    transition: delta.transition,
    explanation: delta.theme.explanation,
  };

  if (delta.theme.materialAtStake !== undefined) {
    summary.materialAtStake = delta.theme.materialAtStake;
  }

  return summary;
}

/**
 * Summarize a candidate for compact representation
 *
 * Standalone function for direct use.
 */
export function summarizeCandidate(candidate: CandidateMove): CandidateSummary {
  const summary: CandidateSummary = {
    san: candidate.san,
    evalCp: candidate.evalCp,
    source: candidate.primarySource,
    reason: candidate.sourceReason,
  };

  if (candidate.mate !== undefined) {
    summary.mate = candidate.mate;
  }

  if (candidate.maiaProbability !== undefined) {
    summary.humanProb = Math.round(candidate.maiaProbability * 100) / 100;
  }

  if (candidate.pvPreview.length > 0) {
    summary.pvPreview = candidate.pvPreview.slice(0, MAX_PV_PREVIEW);
  }

  return summary;
}

/**
 * Create a line context snapshot from line memory
 *
 * Standalone function for direct use.
 */
export function createLineContextSnapshot(
  lineMemory: LineMemory,
  maxBullets: number = MAX_SUMMARY_BULLETS,
): LineContextSnapshot {
  const bullets = getSummaryBullets(lineMemory);
  const recentSummary = bullets.slice(-maxBullets);
  const unexplainedThemes = getUnexplainedThemes(lineMemory);

  const context: LineContextSnapshot = {
    ply: lineMemory.currentPly,
    recentSummary,
    evalTrend: getEvalTrendDirection(lineMemory),
    unexplainedThemeCount: unexplainedThemes.length,
  };

  if (lineMemory.narrativeFocus !== undefined) {
    context.focus = lineMemory.narrativeFocus;
  }

  return context;
}
