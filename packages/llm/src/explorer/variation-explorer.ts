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
  /** LLM explanation for key moves in this line (move index -> comment) */
  annotations: Map<number, string>;
  /** NAGs for moves in this line (move index -> NAG like "$1", "$4") */
  nags: Map<number, string>;
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
      const bestLine = await this.exploreLineDeep(
        session,
        engineBest.pv,
        'best',
        'engine',
        engineBest,
      );
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
          const altLine = await this.exploreLineDeep(
            session,
            nextEval.pv,
            'thematic',
            'engine',
            nextEval,
          );
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

    // Engine's best line with verbal evaluation
    const isWhite = this.isWhiteToMove(session.position);
    const evalVerbal = this.formatEvalVerbal(engineBest.cp, engineBest.mate, isWhite);
    parts.push(`BEST LINE: ${engineBest.pv.slice(0, 8).join(' ')} (${evalVerbal})`);

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
    parts.push('## VARIATION LENGTH GUIDANCE:');
    parts.push('Variations should continue until the position is RESOLVED.');
    parts.push('');
    parts.push('STOP EXPLORING when:');
    parts.push('- Material is won/lost and recaptures are exhausted');
    parts.push('- A forcing sequence ends (checks/captures stop)');
    parts.push('- Position reaches clear equality with no remaining tension');
    parts.push('- Mate is delivered or forced');
    parts.push('');
    parts.push('KEEP EXPLORING if:');
    parts.push('- Captures are still being exchanged');
    parts.push('- Checks are ongoing without repetition');
    parts.push('- Hanging pieces could still be taken');
    parts.push('- The "point" has not been demonstrated yet');
    parts.push('');
    parts.push(
      'RULES: No numeric evaluations. Use verbal assessments: "winning", "clear advantage", "slight edge", "equal".',
    );
    parts.push('Each explanation must be 1-2 sentences max.');
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
   *
   * Converts UCI moves to SAN and determines appropriate line length
   * based on position characteristics (tension resolution).
   */
  private async exploreLineDeep(
    session: ExplorationSession,
    moves: string[],
    purpose: LinePurpose,
    source: LineSource,
    initialEval?: EngineEvaluation,
  ): Promise<ExploredLine> {
    // Convert UCI moves to SAN using the session's position
    let sanMoves: string[];
    try {
      sanMoves = ChessPosition.convertPvToSan(moves, session.position);
    } catch {
      // If conversion fails, return empty line
      sanMoves = [];
    }

    // Determine how many moves to include based on tension resolution
    const lineMoves = this.determineLineLength(session.position, sanMoves, session.maxDepth);

    const line: ExploredLine = {
      moves: lineMoves,
      annotations: new Map(),
      nags: new Map(),
      branches: [],
      purpose,
      source,
    };

    // Only set finalEval if we have one (for end-of-line position NAG)
    if (initialEval) {
      line.finalEval = initialEval;
    }

    // For long tactical lines, ask LLM to identify key moves to annotate
    // Pass finalEval so LLM can generate appropriate ending comments
    // Pass purpose/source so LLM can generate natural opening comments
    if (lineMoves.length > 4 && session.llmCallCount < session.softCallCap) {
      const keyMoves = await this.identifyKeyMoves(
        session,
        lineMoves,
        line.finalEval,
        purpose,
        source,
      );
      for (const km of keyMoves) {
        if (km.moveIndex < line.moves.length) {
          line.annotations.set(km.moveIndex, km.explanation);
        }
      }
    }

    return line;
  }

  /**
   * Determine line length using tension resolution principles
   *
   * Stop exploring when:
   * 1. We've shown enough moves to demonstrate the concept (min 4)
   * 2. Position has stabilized (no hanging pieces, no immediate tactics)
   * 3. We reach the max depth
   */
  private determineLineLength(startFen: string, moves: string[], maxDepth: number): string[] {
    const minMoves = 4;
    const maxMoves = Math.min(moves.length, maxDepth, 15);

    if (moves.length <= minMoves) {
      return moves;
    }

    // Play through the moves and check for tension resolution
    const pos = new ChessPosition(startFen);
    let lastCaptureIndex = -1;
    let lastCheckIndex = -1;

    for (let i = 0; i < maxMoves; i++) {
      const san = moves[i];
      if (!san) break;

      // Track captures (indicated by 'x' in SAN)
      if (san.includes('x')) {
        lastCaptureIndex = i;
      }

      // Track checks (indicated by '+' or '#' in SAN)
      if (san.includes('+') || san.includes('#')) {
        lastCheckIndex = i;
      }

      try {
        pos.move(san);
      } catch {
        // Invalid move, stop here
        return moves.slice(0, i);
      }
    }

    // Tension resolves when:
    // 1. We've passed the last capture by at least 2 moves
    // 2. We've passed the last check by at least 2 moves
    // 3. We've shown at least minMoves
    const tensionResolvedAt = Math.max(lastCaptureIndex + 3, lastCheckIndex + 2, minMoves);

    // Return moves up to tension resolution, but at least minMoves
    const stopAt = Math.min(tensionResolvedAt, maxMoves);
    return moves.slice(0, Math.max(stopAt, minMoves));
  }

  /**
   * Explore a mistake line (human-likely move that's suboptimal)
   *
   * This explores what happens when a human plays a suboptimal move:
   * 1. Make the mistake move to get the resulting position
   * 2. Get engine's refutation (best response to the mistake)
   * 3. Build the line showing the consequence of the mistake
   */
  private async exploreMistakeLine(
    session: ExplorationSession,
    fen: string,
    mistakeMove: string,
    _probability: number,
  ): Promise<ExploredLine> {
    // Convert mistake move to SAN if it's in UCI format
    // Maia may return moves in either format, so we normalize to SAN for PGN output
    const pos = new ChessPosition(fen);
    let mistakeMoveSan: string;
    try {
      mistakeMoveSan = pos.uciToSan(mistakeMove);
    } catch {
      // Already in SAN format or move parsing failed, use as-is
      mistakeMoveSan = mistakeMove;
    }

    // 1. Make the mistake move to get resulting position
    const posAfterMistake = new ChessPosition(fen);
    let fenAfterMistake: string;
    try {
      posAfterMistake.move(mistakeMove);
      fenAfterMistake = posAfterMistake.fen();
    } catch {
      // Invalid move, return minimal line with SAN notation
      return {
        moves: [mistakeMoveSan],
        annotations: new Map(),
        nags: new Map(),
        branches: [],
        purpose: 'human_alternative',
        source: 'maia',
      };
    }

    // 2. Get engine's refutation (best response to the mistake)
    let refutation: EngineEvaluation[];
    try {
      refutation = await this.engine.evaluateMultiPv(fenAfterMistake, {
        depth: this.config.engineDepth,
        timeLimitMs: this.config.engineTimeLimitMs,
        numLines: 1,
      });
    } catch {
      // Engine unavailable, return minimal line with SAN notation
      return {
        moves: [mistakeMoveSan],
        annotations: new Map(),
        nags: new Map(),
        branches: [],
        purpose: 'human_alternative',
        source: 'maia',
      };
    }

    // 3. Build the line: mistake move + refutation continuation (use SAN for output)
    let moves = [mistakeMoveSan];
    let finalEval: EngineEvaluation | undefined;

    if (refutation.length > 0 && refutation[0]!.pv.length > 0) {
      // Convert UCI moves to SAN
      try {
        const refutationSan = ChessPosition.convertPvToSan(refutation[0]!.pv, fenAfterMistake);
        // Limit to reasonable depth but show enough to demonstrate the refutation
        const maxRefutationMoves = Math.min(refutationSan.length, session.maxDepth - 1, 8);
        moves = moves.concat(refutationSan.slice(0, maxRefutationMoves));
        finalEval = refutation[0];
      } catch {
        // Conversion failed, use just the mistake move
      }
    }

    const line: ExploredLine = {
      moves,
      annotations: new Map(),
      nags: new Map(),
      branches: [],
      purpose: 'human_alternative',
      source: 'maia',
    };

    // Only set finalEval if we have one (for end-of-line position NAG)
    if (finalEval) {
      line.finalEval = finalEval;
    }

    return line;
  }

  /**
   * Extract side-to-move from FEN string
   */
  private isWhiteToMove(fen: string): boolean {
    const parts = fen.split(' ');
    return parts.length < 2 || parts[1] === 'w';
  }

  /**
   * Format evaluation as verbal description (no centipawns)
   *
   * @param cp - Centipawn evaluation (from side-to-move's perspective)
   * @param mate - Mate-in-X (from side-to-move's perspective)
   * @param isWhite - Whether White is to move (determines how to interpret the eval sign)
   */
  private formatEvalVerbal(
    cp: number | undefined,
    mate: number | undefined,
    isWhite: boolean,
  ): string {
    // Determine which side is better based on eval sign and side to move
    // Side-to-move perspective: positive = side to move is better
    const determineSide = (evalIsPositive: boolean): 'White' | 'Black' => {
      if (evalIsPositive) {
        return isWhite ? 'White' : 'Black';
      } else {
        return isWhite ? 'Black' : 'White';
      }
    };

    if (mate !== undefined) {
      const side = determineSide(mate > 0);
      const moves = Math.abs(mate);
      if (moves === 1) return `${side} delivers checkmate`;
      if (moves <= 3) return `${side} has a forced mate in ${moves}`;
      return `${side} has a forced mate`;
    }

    if (cp === undefined) return 'unclear';

    const abs = Math.abs(cp);
    const side = determineSide(cp > 0);

    if (abs < 25) return 'equal';
    if (abs < 50) return `${side} has a slight edge`;
    if (abs < 100) return `${side} is slightly better`;
    if (abs < 200) return `${side} has a clear advantage`;
    if (abs < 400) return `${side} is much better`;
    if (abs < 700) return `${side} is winning`;
    return `${side} has a decisive advantage`;
  }

  /**
   * Ask LLM to identify key moves in a line that deserve terse inline annotation
   *
   * Uses enhanced prompt to generate short, impactful comments like:
   * "{the point}", "{threatening mate}", "{and black wins material}"
   *
   * The opening comment naturally incorporates the variation's purpose/source
   * context (e.g., "the engine's top choice" vs "a practical alternative").
   *
   * @param session - Current exploration session
   * @param moves - SAN moves in the variation
   * @param finalEval - Optional engine evaluation at end of line
   * @param purpose - Purpose of this variation (best, human_alternative, etc.)
   * @param source - Source of this variation (engine, maia, llm)
   */
  private async identifyKeyMoves(
    session: ExplorationSession,
    moves: string[],
    finalEval?: EngineEvaluation,
    purpose?: LinePurpose,
    source?: LineSource,
  ): Promise<Array<{ moveIndex: number; explanation: string }>> {
    // Calculate final position's FEN and verbal assessment
    let finalFen = session.position;
    try {
      const pos = new ChessPosition(session.position);
      for (const m of moves) {
        pos.move(m);
      }
      finalFen = pos.fen();
    } catch {
      // Use starting position if playthrough fails
    }

    const isWhiteAtEnd = this.isWhiteToMove(finalFen);
    const verbalEval = finalEval
      ? this.formatEvalVerbal(finalEval.cp, finalEval.mate, isWhiteAtEnd)
      : 'unclear';

    // Determine expected number of key moves based on line length
    const expectedKeyMoves = moves.length <= 6 ? '2-3' : moves.length <= 12 ? '3-4' : '4-5';

    // Build context about variation purpose for natural opening comments
    const purposeContext = purpose
      ? {
          best: "This is the engine's top recommendation - the most precise continuation.",
          human_alternative:
            'This is what humans typically play at this level - a practical choice.',
          refutation: "This line punishes the opponent's inaccuracy.",
          trap: 'This is a tempting but flawed idea.',
          thematic: 'This illustrates a key positional or tactical theme.',
        }[purpose]
      : '';

    const sourceHint =
      source === 'maia'
        ? 'This reflects typical human play at the target rating.'
        : source === 'engine'
          ? "This is the computer's precise recommendation."
          : '';

    const prompt = [
      `POSITION: ${session.position}`,
      `LINE: ${moves.join(' ')}`,
      `TARGET RATING: ${session.targetRating}`,
      `FINAL ASSESSMENT: ${verbalEval}`,
      purposeContext && `VARIATION CONTEXT: ${purposeContext}`,
      sourceHint && `SOURCE: ${sourceHint}`,
      '',
      'TASK: Annotate this variation with terse inline comments.',
      '',
      '## OPENING COMMENT (REQUIRED):',
      'The FIRST move (moveIndex 0) MUST have a comment that naturally explains',
      'WHY this variation is being shown. Use the VARIATION CONTEXT to guide this.',
      '',
      'Examples of natural opening comments:',
      '- For engine lines: "the most precise continuation" or "the engine\'s recommendation"',
      '- For human alternatives: "a practical choice" or "what many players naturally try"',
      '- For refutations: "punishing the error" or "exploiting the weakness"',
      '- For traps: "tempting but" or "this looks appealing but fails"',
      '- For thematic ideas: "illustrating the key plan" or "the typical maneuver here"',
      '',
      'Make this NATURAL PROSE, not a label.',
      'BAD: "engine best"',
      'GOOD: "the engine\'s top choice, striking immediately in the center"',
      '',
      '## Comment Guidelines:',
      `- Mark ${expectedKeyMoves} key moments (including opening and ending)`,
      '- Keep comments SHORT: 2-6 words preferred',
      '- Use lowercase, no ending punctuation',
      '- Style: "{the point}", "{threatening Qxh7}"',
      '',
      '## Comment Types:',
      '1. "THE POINT" - key tactical idea revealed',
      '   Examples: "the point", "the idea becomes clear"',
      '',
      '2. "BUILDUP" - plan coming together',
      '   Examples: "threatening mate", "with tempo", "forcing"',
      '',
      '3. "OUTCOME" - REQUIRED at variation END explaining WHY',
      '   Decisive: "and black wins the exchange"',
      '   Mate: "forced mate follows"',
      '   Draw: "with everything symmetrical, this is a draw"',
      '   Equal: "with approximate equality"',
      '',
      '## CRITICAL RULES:',
      '- First move (index 0) MUST have natural opening comment',
      '- Last move MUST have contextual outcome comment',
      '- No numeric evaluations',
      '- No "this move" or "here" - just the idea',
      '',
      'Respond with JSON:',
      '{',
      '  "keyMoves": [',
      '    { "moveIndex": 0, "explanation": "the engine\'s top choice" },',
      `    { "moveIndex": ${moves.length - 1}, "explanation": "and black wins material" }`,
      '  ]',
      '}',
    ]
      .filter(Boolean)
      .join('\n');

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

      const keyMoves = parsed.keyMoves ?? [];

      // Ensure we have an ending comment if LLM missed it
      const hasEndingComment = keyMoves.some((km) => km.moveIndex === moves.length - 1);
      if (!hasEndingComment && moves.length > 0) {
        // Add a fallback ending comment based on evaluation
        keyMoves.push({
          moveIndex: moves.length - 1,
          explanation: this.generateEndingComment(verbalEval),
        });
      }

      return keyMoves;
    } catch {
      // Fallback: just add ending comment
      if (moves.length > 0) {
        return [
          {
            moveIndex: moves.length - 1,
            explanation: this.generateEndingComment(verbalEval),
          },
        ];
      }
      return [];
    }
  }

  /**
   * Generate a contextual ending comment based on evaluation
   */
  private generateEndingComment(verbalEval: string): string {
    // Convert verbal evaluation to terse ending comment
    if (verbalEval.includes('checkmate')) {
      return 'checkmate';
    }
    if (verbalEval.includes('forced mate')) {
      return 'with forced mate';
    }
    if (verbalEval.includes('decisive')) {
      const side = verbalEval.includes('White') ? 'white' : 'black';
      return `and ${side} wins`;
    }
    if (verbalEval.includes('winning')) {
      const side = verbalEval.includes('White') ? 'white' : 'black';
      return `${side} is winning`;
    }
    if (verbalEval.includes('much better')) {
      const side = verbalEval.includes('White') ? 'white' : 'black';
      return `${side} has a large advantage`;
    }
    if (verbalEval.includes('clear advantage')) {
      const side = verbalEval.includes('White') ? 'white' : 'black';
      return `${side} is clearly better`;
    }
    if (verbalEval.includes('slightly better') || verbalEval.includes('slight edge')) {
      const side = verbalEval.includes('White') ? 'white' : 'black';
      return `${side} is slightly better`;
    }
    if (verbalEval === 'equal' || verbalEval.includes('equal')) {
      return 'with equality';
    }
    return 'with an unclear position';
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
