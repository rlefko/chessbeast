/**
 * Iterative Variation Explorer
 *
 * Implements an iterative dialogue between engine/Maia and LLM to build
 * deep, instructive variations. Key features:
 *
 * - Engine + Maia: Engine for best moves, Maia for human-likely alternatives
 * - Depth-first: Follow main line deep (20-40 moves) before branching
 * - Human mistakes: Show what humans might play and why it's wrong
 * - Self-regulating: LLM assesses if more exploration needed
 */

import { ChessPosition } from '@chessbeast/pgn';

import type { OpenAIClient } from '../client/openai-client.js';
import type { LLMConfig } from '../config/llm-config.js';
import { CHESS_ANNOTATOR_SYSTEM } from '../prompts/system-prompts.js';

/**
 * Engine evaluation interface (matches @chessbeast/core EngineEvaluation)
 */
export interface EngineEvaluation {
  cp?: number;
  mate?: number;
  depth: number;
  pv: string[];
}

/**
 * Engine service interface (matches @chessbeast/core EngineService)
 */
export interface EngineService {
  evaluate(fen: string, depth: number): Promise<EngineEvaluation>;
  evaluateMultiPv(
    fen: string,
    options: { depth?: number; timeLimitMs?: number; numLines?: number },
  ): Promise<EngineEvaluation[]>;
}

/**
 * Maia service interface (matches @chessbeast/core MaiaService)
 */
export interface MaiaService {
  predictMoves(fen: string, rating: number): Promise<Array<{ san: string; probability: number }>>;
}

/**
 * Purpose of an explored line
 */
export type LinePurpose = 'best' | 'human_alternative' | 'refutation' | 'trap' | 'thematic';

/**
 * Source of an explored line
 */
export type LineSource = 'engine' | 'maia' | 'llm';

/**
 * A single explored line with its annotation
 */
export interface ExploredLine {
  /** SAN moves in this line */
  moves: string[];
  /** LLM explanation for key moves in this line */
  annotations: Map<number, string>;
  /** Nested variations branching from this line */
  branches: ExploredLine[];
  /** Purpose of this line */
  purpose: LinePurpose;
  /** Where this line came from */
  source: LineSource;
  /** Final evaluation of the line */
  finalEval?: EngineEvaluation;
}

/**
 * Exploration session state
 */
export interface ExplorationSession {
  /** Starting position FEN */
  position: string;
  /** Target rating for explanations */
  targetRating: number;
  /** Explored lines so far */
  exploredLines: ExploredLine[];
  /** Current exploration depth */
  depth: number;
  /** Maximum depth to explore */
  maxDepth: number;
  /** LLM call count */
  llmCallCount: number;
  /** Soft cap on LLM calls */
  softCallCap: number;
  /** Whether LLM requested more exploration */
  llmRequestedMore: boolean;
}

/**
 * LLM exploration decision
 */
interface ExplorationDecision {
  /** Whether to explore the engine's best line */
  exploreBestLine: boolean;
  /** Whether to show the human-likely mistake */
  showHumanMistake: boolean;
  /** Explanation for the human mistake */
  mistakeExplanation: string | undefined;
  /** Explanation for the best line */
  bestLineExplanation: string | undefined;
  /** Whether more exploration is needed */
  needsMoreExploration: boolean;
  /** Specific moves to annotate */
  keyMoves: Array<{ moveIndex: number; explanation: string }> | undefined;
}

/**
 * Exploration configuration
 */
export interface ExplorationConfig {
  /** Maximum depth for main line exploration (default: 40) */
  maxDepth?: number;
  /** Soft cap on LLM calls per position (default: 15) */
  softCallCap?: number;
  /** Hard cap on LLM calls (soft cap * 1.5) */
  hardCallCap?: number;
  /** Depth for engine analysis (default: 22) */
  engineDepth?: number;
  /** Time limit for engine analysis in ms (default: 5000) */
  engineTimeLimitMs?: number;
}

const DEFAULT_CONFIG: Required<ExplorationConfig> = {
  maxDepth: 40,
  softCallCap: 15,
  hardCallCap: 22, // softCallCap * 1.5, rounded
  engineDepth: 22,
  engineTimeLimitMs: 5000,
};

/**
 * Variation Explorer - iteratively builds deep, instructive variations
 */
export class VariationExplorer {
  private config: Required<ExplorationConfig>;

  constructor(
    private readonly engine: EngineService,
    private readonly maia: MaiaService | undefined,
    private readonly llmClient: OpenAIClient,
    private readonly llmConfig: LLMConfig,
    config: ExplorationConfig = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Explore variations from a critical position
   *
   * @param fen - Starting position
   * @param targetRating - Target rating for explanations
   * @param playedMove - The move that was actually played (for context)
   * @returns Explored lines with annotations
   */
  async explorePosition(
    fen: string,
    targetRating: number,
    playedMove?: string,
  ): Promise<ExploredLine[]> {
    const session: ExplorationSession = {
      position: fen,
      targetRating,
      exploredLines: [],
      depth: 0,
      maxDepth: this.config.maxDepth,
      llmCallCount: 0,
      softCallCap: this.config.softCallCap,
      llmRequestedMore: false,
    };

    // Get engine's best line
    const engineEvals = await this.engine.evaluateMultiPv(fen, {
      depth: this.config.engineDepth,
      timeLimitMs: this.config.engineTimeLimitMs,
      numLines: 3,
    });

    if (engineEvals.length === 0) {
      return [];
    }

    const engineBest = engineEvals[0]!;

    // Get Maia's prediction for human-likely move
    let maiaPrediction: { san: string; probability: number } | undefined;
    if (this.maia) {
      try {
        const predictions = await this.maia.predictMoves(fen, targetRating);
        if (predictions.length > 0) {
          maiaPrediction = predictions[0];
        }
      } catch {
        // Maia unavailable, continue without
      }
    }

    // Ask LLM to decide exploration strategy
    const decision = await this.getExplorationDecision(
      session,
      engineBest,
      maiaPrediction,
      playedMove,
    );

    // Explore the best line if LLM says so (depth-first)
    if (decision.exploreBestLine && engineBest.pv.length > 0) {
      const bestLine = await this.exploreLineDeep(session, engineBest.pv, 'best', 'engine');
      if (decision.bestLineExplanation) {
        bestLine.annotations.set(0, decision.bestLineExplanation);
      }
      session.exploredLines.push(bestLine);
    }

    // Show human mistake if different from best and LLM says so
    if (
      decision.showHumanMistake &&
      maiaPrediction &&
      maiaPrediction.san !== engineBest.pv[0] &&
      maiaPrediction.san !== playedMove
    ) {
      // Get engine evaluation of the human-likely move
      const mistakeLine = await this.exploreMistakeLine(
        session,
        fen,
        maiaPrediction.san,
        maiaPrediction.probability,
      );
      if (decision.mistakeExplanation) {
        mistakeLine.annotations.set(0, decision.mistakeExplanation);
      }
      session.exploredLines.push(mistakeLine);
    }

    // Continue exploration if LLM requests more and we have budget
    while (
      decision.needsMoreExploration &&
      session.llmCallCount < this.config.hardCallCap &&
      session.exploredLines.length < 5
    ) {
      // Get additional engine lines
      if (engineEvals.length > session.exploredLines.length) {
        const nextEval = engineEvals[session.exploredLines.length];
        if (nextEval && nextEval.pv.length > 0) {
          const altLine = await this.exploreLineDeep(session, nextEval.pv, 'thematic', 'engine');
          session.exploredLines.push(altLine);
        }
      } else {
        break;
      }
    }

    return session.exploredLines;
  }

  /**
   * Ask LLM to decide exploration strategy
   */
  private async getExplorationDecision(
    session: ExplorationSession,
    engineBest: EngineEvaluation,
    maiaPrediction: { san: string; probability: number } | undefined,
    playedMove?: string,
  ): Promise<ExplorationDecision> {
    const prompt = this.buildDecisionPrompt(session, engineBest, maiaPrediction, playedMove);

    try {
      const response = await this.llmClient.chat({
        messages: [
          { role: 'system', content: CHESS_ANNOTATOR_SYSTEM },
          { role: 'user', content: prompt },
        ],
        temperature: this.llmConfig.temperature,
        responseFormat: 'json',
      });

      session.llmCallCount++;

      // Parse response
      const parsed = JSON.parse(response.content) as Partial<ExplorationDecision>;

      return {
        exploreBestLine: parsed.exploreBestLine ?? true,
        showHumanMistake: parsed.showHumanMistake ?? maiaPrediction !== undefined,
        mistakeExplanation: parsed.mistakeExplanation,
        bestLineExplanation: parsed.bestLineExplanation,
        needsMoreExploration: parsed.needsMoreExploration ?? false,
        keyMoves: parsed.keyMoves,
      };
    } catch {
      // Default to exploring best line
      return {
        exploreBestLine: true,
        showHumanMistake: maiaPrediction !== undefined,
        mistakeExplanation: undefined,
        bestLineExplanation: undefined,
        needsMoreExploration: false,
        keyMoves: undefined,
      };
    }
  }

  /**
   * Build prompt for exploration decision
   */
  private buildDecisionPrompt(
    session: ExplorationSession,
    engineBest: EngineEvaluation,
    maiaPrediction: { san: string; probability: number } | undefined,
    playedMove?: string,
  ): string {
    const parts: string[] = [];

    parts.push(`POSITION: ${session.position}`);
    parts.push(`TARGET RATING: ${session.targetRating}`);

    // Engine's best line
    const evalStr =
      engineBest.mate !== undefined
        ? `Mate in ${Math.abs(engineBest.mate)}`
        : `${(engineBest.cp ?? 0) / 100}`;
    parts.push(`ENGINE BEST: ${engineBest.pv.slice(0, 8).join(' ')} (${evalStr})`);

    // Maia's prediction
    if (maiaPrediction) {
      parts.push(
        `HUMAN LIKELY: ${maiaPrediction.san} (${Math.round(maiaPrediction.probability * 100)}% probability)`,
      );
    }

    // What was actually played
    if (playedMove) {
      parts.push(`PLAYED MOVE: ${playedMove}`);
    }

    // Budget info
    parts.push(`LLM CALLS: ${session.llmCallCount}/${session.softCallCap} (soft cap)`);

    parts.push('');
    parts.push('TASK: Decide how to explore this position for a chess annotation.');
    parts.push('');
    parts.push('Consider:');
    parts.push(
      '- Is the engine line instructive? Does it show a clear tactical or strategic idea?',
    );
    parts.push("- Is the human-likely move a mistake worth highlighting? What's the refutation?");
    parts.push('- Should we explore deeper or is the position simple enough?');
    parts.push('');
    parts.push('Respond with JSON:');
    parts.push('{');
    parts.push('  "exploreBestLine": true/false,');
    parts.push('  "bestLineExplanation": "Why this line is important (1-2 sentences)",');
    parts.push('  "showHumanMistake": true/false,');
    parts.push('  "mistakeExplanation": "Why the human move is wrong (1-2 sentences)",');
    parts.push('  "needsMoreExploration": true/false');
    parts.push('}');

    return parts.join('\n');
  }

  /**
   * Explore a line depth-first
   */
  private async exploreLineDeep(
    session: ExplorationSession,
    moves: string[],
    purpose: LinePurpose,
    source: LineSource,
  ): Promise<ExploredLine> {
    // Convert UCI moves to SAN using the session's position
    let sanMoves: string[];
    try {
      sanMoves = ChessPosition.convertPvToSan(moves, session.position);
    } catch {
      // If conversion fails, return empty line
      sanMoves = [];
    }

    const line: ExploredLine = {
      moves: sanMoves.slice(0, session.maxDepth),
      annotations: new Map(),
      branches: [],
      purpose,
      source,
    };

    // For long tactical lines, ask LLM to identify key moves to annotate
    if (sanMoves.length > 4 && session.llmCallCount < session.softCallCap) {
      const keyMoves = await this.identifyKeyMoves(session, sanMoves);
      for (const km of keyMoves) {
        if (km.moveIndex < line.moves.length) {
          line.annotations.set(km.moveIndex, km.explanation);
        }
      }
    }

    return line;
  }

  /**
   * Explore a mistake line (human-likely move that's suboptimal)
   */
  private async exploreMistakeLine(
    _session: ExplorationSession,
    _fen: string,
    mistakeMove: string,
    probability: number,
  ): Promise<ExploredLine> {
    // Get engine refutation of the mistake
    // Note: We'd need to make the move first to get the refutation PV
    // For now, just create a stub line
    const line: ExploredLine = {
      moves: [mistakeMove],
      annotations: new Map(),
      branches: [],
      purpose: 'human_alternative',
      source: 'maia',
    };

    // Try to get engine's refutation
    try {
      // This would require making the move and then evaluating
      // For simplicity, we'll annotate that this is a human-likely move
      line.annotations.set(
        0,
        `Human players at this level choose this move ${Math.round(probability * 100)}% of the time.`,
      );
    } catch {
      // Skip refutation
    }

    return line;
  }

  /**
   * Ask LLM to identify key moves in a line that deserve annotation
   */
  private async identifyKeyMoves(
    session: ExplorationSession,
    moves: string[],
  ): Promise<Array<{ moveIndex: number; explanation: string }>> {
    const prompt = [
      `POSITION: ${session.position}`,
      `LINE: ${moves.join(' ')}`,
      `TARGET RATING: ${session.targetRating}`,
      '',
      'TASK: Identify the 2-3 most instructive moves in this line.',
      'These are moves that teach an important concept or are tactically critical.',
      '',
      'Respond with JSON:',
      '{',
      '  "keyMoves": [',
      '    { "moveIndex": 0, "explanation": "Why this move matters" },',
      '    { "moveIndex": 3, "explanation": "Why this move matters" }',
      '  ]',
      '}',
    ].join('\n');

    try {
      const response = await this.llmClient.chat({
        messages: [
          { role: 'system', content: CHESS_ANNOTATOR_SYSTEM },
          { role: 'user', content: prompt },
        ],
        temperature: this.llmConfig.temperature,
        responseFormat: 'json',
      });

      session.llmCallCount++;

      const parsed = JSON.parse(response.content) as {
        keyMoves?: Array<{ moveIndex: number; explanation: string }>;
      };
      return parsed.keyMoves ?? [];
    } catch {
      return [];
    }
  }
}

/**
 * Create a variation explorer
 */
export function createVariationExplorer(
  engine: EngineService,
  maia: MaiaService | undefined,
  llmClient: OpenAIClient,
  llmConfig: LLMConfig,
  config?: ExplorationConfig,
): VariationExplorer {
  return new VariationExplorer(engine, maia, llmClient, llmConfig, config);
}
