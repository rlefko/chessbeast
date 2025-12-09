/**
 * Engine-Driven Explorer
 *
 * Wraps PriorityQueueExplorer with theme detection and intent generation.
 * This replaces the LLM-driven AgenticVariationExplorer with an architecture
 * where the engine explores and the LLM annotates post-write.
 *
 * Key differences from agentic exploration:
 * - Engine-driven: PriorityQueueExplorer handles all exploration decisions
 * - Theme-aware: Detects themes at each explored node
 * - Intent generation: Creates CommentIntents for post-write narration
 * - Cache-integrated: Uses ArtifactCache for transposition handling
 */

import {
  type ArtifactCache,
  type VariationDAG,
  type ExplorationNode,
  type CandidateMove,
  type ExplorationResult,
  PriorityQueueExplorer,
  createVariationDAG,
  type CriticalityScore,
  calculateCriticality,
  type MoveClassification,
} from '@chessbeast/core';
import { ChessPosition } from '@chessbeast/pgn';

import type {
  CommentIntent,
  IntentInput,
  DensityLevel,
  AudienceLevel,
} from '../narration/index.js';
import { createCommentIntent } from '../narration/intents.js';
import type { DetectorContext, DetectorPosition } from '../themes/detector-interface.js';
import { createFullDetectorRegistry } from '../themes/detectors/index.js';
import {
  ThemeLifecycleTracker,
  createLifecycleTracker,
  filterSignificantDeltas,
} from '../themes/lifecycle.js';
import type { ThemeInstance, ThemeDelta, ThemeSummary } from '../themes/types.js';

import type { EngineService, ExploredLine, LinePurpose, LineSource } from './variation-explorer.js';

/**
 * Theme verbosity levels
 */
export type ThemeVerbosity = 'none' | 'important' | 'all';

/**
 * Configuration for the engine-driven explorer
 */
export interface EngineDrivenExplorerConfig {
  /** Maximum nodes to explore */
  maxNodes?: number;

  /** Maximum exploration depth */
  maxDepth?: number;

  /** Time budget in milliseconds */
  budgetMs?: number;

  /** Whether to detect themes */
  detectThemes?: boolean;

  /** Theme verbosity level */
  themeVerbosity?: ThemeVerbosity;

  /** Target audience level */
  audience?: AudienceLevel;

  /** Target player rating for Maia predictions */
  targetRating?: number;

  /** Density level for comment filtering */
  density?: DensityLevel;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<EngineDrivenExplorerConfig> = {
  maxNodes: 200,
  maxDepth: 30,
  budgetMs: 30000,
  detectThemes: true,
  themeVerbosity: 'important',
  audience: 'club',
  targetRating: 1500,
  density: 'normal',
};

/**
 * Progress callback information
 */
export interface EngineDrivenExplorerProgress {
  /** Current phase */
  phase: 'exploring' | 'detecting_themes' | 'generating_intents';

  /** Number of nodes explored */
  nodesExplored: number;

  /** Maximum nodes to explore */
  maxNodes: number;

  /** Current depth reached */
  currentDepth: number;

  /** Number of themes detected */
  themesDetected: number;

  /** Number of intents generated */
  intentsGenerated: number;
}

/**
 * Result from engine-driven exploration
 */
export interface EngineDrivenExplorerResult {
  /** Explored variations in legacy format for backward compatibility */
  variations: ExploredLine[];

  /** The variation DAG with full transposition support */
  dag: VariationDAG;

  /** Themes detected during exploration, keyed by position key */
  themes: Map<string, ThemeInstance[]>;

  /** Theme summaries by position */
  themeSummaries: Map<string, ThemeSummary>;

  /** Comment intents generated from exploration */
  intents: CommentIntent[];

  /** Number of nodes explored */
  nodesExplored: number;

  /** Number of cache hits (transpositions) */
  cacheHits: number;

  /** Maximum depth reached */
  maxDepthReached: number;

  /** Time taken in milliseconds */
  timeMs: number;

  /** Stopping reason */
  stoppingReason: string;
}

/**
 * Engine-Driven Explorer
 *
 * Wraps PriorityQueueExplorer with theme detection and intent generation.
 */
export class EngineDrivenExplorer {
  private readonly engine: EngineService;
  private readonly cache: ArtifactCache;
  private readonly config: Required<EngineDrivenExplorerConfig>;
  private readonly detectorRegistry: ReturnType<typeof createFullDetectorRegistry>;
  private readonly lifecycleTracker: ThemeLifecycleTracker;

  constructor(
    engine: EngineService,
    cache: ArtifactCache,
    config: Partial<EngineDrivenExplorerConfig> = {},
  ) {
    this.engine = engine;
    this.cache = cache;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.detectorRegistry = createFullDetectorRegistry();
    this.lifecycleTracker = createLifecycleTracker();
  }

  /**
   * Explore from a position with the played move
   *
   * @param rootFen - Starting position FEN (before the move)
   * @param playedMove - The move that was played (SAN)
   * @param classification - Move classification (blunder, mistake, etc.)
   * @param onProgress - Progress callback
   * @returns Exploration result with themes and intents
   */
  async explore(
    rootFen: string,
    playedMove?: string,
    classification?: MoveClassification,
    onProgress?: (progress: EngineDrivenExplorerProgress) => void,
  ): Promise<EngineDrivenExplorerResult> {
    const startTime = Date.now();

    // Create a fresh DAG for this exploration
    const dag = createVariationDAG(rootFen);

    // Create the priority queue explorer
    const explorer = new PriorityQueueExplorer(this.engine, {
      cache: this.cache,
      dag,
      maxNodes: this.config.maxNodes,
      maxDepth: this.config.maxDepth,
      budgetMs: this.config.budgetMs,
    });

    // Reset lifecycle tracker for new exploration
    this.lifecycleTracker.reset();

    // Track themes and intents
    const allThemes = new Map<string, ThemeInstance[]>();
    const themeSummaries = new Map<string, ThemeSummary>();
    const allIntents: CommentIntent[] = [];
    const explainedIdeaKeys = new Set<string>();
    let themesDetected = 0;

    // Set up node exploration callback for intent and theme detection
    // Always register - intent generation works with or without theme detection
    explorer.onNodeExplored((node: ExplorationNode) => {
      // Process themes and generate intents
      const { themes, summary, intents } = this.processNodeForIntents(
        node,
        explainedIdeaKeys,
        this.config.detectThemes,
      );

      if (themes.length > 0) {
        allThemes.set(node.positionKey, themes);
        themeSummaries.set(node.positionKey, summary);
        themesDetected += themes.length;
      }

      allIntents.push(...intents);

      // Update progress
      onProgress?.({
        phase: 'exploring',
        nodesExplored: explorer.getState().nodesExplored,
        maxNodes: this.config.maxNodes,
        currentDepth: node.explorationDepth,
        themesDetected,
        intentsGenerated: allIntents.length,
      });
    });

    // Build initial candidates from position analysis
    const candidates = await this.buildInitialCandidates(rootFen, playedMove, classification);

    // Run exploration
    onProgress?.({
      phase: 'exploring',
      nodesExplored: 0,
      maxNodes: this.config.maxNodes,
      currentDepth: 0,
      themesDetected: 0,
      intentsGenerated: 0,
    });

    const explorationResult = await explorer.explore(rootFen, candidates);

    // Fallback: For critical moments with no intents, create a basic intent
    // This ensures we always have something to annotate for important moves
    if (allIntents.length === 0 && playedMove && classification) {
      const fallbackIntent = this.createCriticalMomentIntent(playedMove, rootFen, classification);
      if (fallbackIntent) {
        allIntents.push(fallbackIntent);
      }
    }

    // Convert to legacy format for backward compatibility
    const variations = this.convertToExploredLines(explorationResult);

    return {
      variations,
      dag,
      themes: allThemes,
      themeSummaries,
      intents: allIntents,
      nodesExplored: explorationResult.nodesExplored,
      cacheHits: explorationResult.nodesSkipped,
      maxDepthReached: explorationResult.maxDepthReached,
      timeMs: Date.now() - startTime,
      stoppingReason: explorationResult.stoppingReason,
    };
  }

  /**
   * Build initial candidates from position analysis
   *
   * The played move is added FIRST to guarantee at least one candidate
   * even if engine evaluation fails or returns empty PVs.
   */
  private async buildInitialCandidates(
    fen: string,
    playedMove?: string,
    classification?: MoveClassification,
  ): Promise<CandidateMove[]> {
    const candidates: CandidateMove[] = [];
    const position = new ChessPosition(fen);

    // FIRST: Add played move as a guaranteed candidate
    // This ensures exploration has at least one move even if engine fails
    if (playedMove) {
      try {
        const resultingFen = this.getResultingFen(position, playedMove);
        if (resultingFen) {
          const uci = this.sanToUci(position, playedMove) ?? playedMove;
          candidates.push({
            san: playedMove,
            uci,
            resultingFen,
            priority:
              classification === 'blunder'
                ? 95
                : classification === 'mistake'
                  ? 90
                  : classification === 'inaccuracy'
                    ? 85
                    : 80,
          });
        } else {
          console.warn(
            `[EngineDrivenExplorer] Could not get resulting FEN for played move ${playedMove} in ${fen}`,
          );
        }
      } catch (e) {
        console.warn(`[EngineDrivenExplorer] Failed to add played move ${playedMove}: ${e}`);
      }
    }

    // THEN: Get engine evaluations for additional candidates
    try {
      const evals = await this.engine.evaluateMultiPv(fen, {
        depth: 18,
        numLines: 5,
      });

      for (const evaluation of evals) {
        if (evaluation.pv && evaluation.pv.length > 0) {
          // evaluation.pv already contains SAN moves (converted by adapter)
          const moveSan = evaluation.pv[0]!;

          // Skip if this is the played move (already added above)
          if (moveSan === playedMove) continue;

          const resultingFen = this.getResultingFen(position, moveSan);
          if (!resultingFen) {
            console.warn(`[EngineDrivenExplorer] Could not get FEN for engine move ${moveSan}`);
            continue;
          }

          const priority = this.calculateCandidatePriority(
            moveSan,
            playedMove,
            classification,
            evaluation.cp,
          );

          // Convert SAN to UCI for proper storage
          const uci = this.sanToUci(position, moveSan) ?? moveSan;

          const candidate: CandidateMove = {
            san: moveSan,
            uci,
            resultingFen,
            priority,
          };

          if (evaluation.cp !== undefined) {
            candidate.evalCp = evaluation.cp;
          }

          candidates.push(candidate);
        }
      }

      // Log if engine returned no usable PVs (beyond the played move)
      if (evals.length > 0 && candidates.length <= 1) {
        console.warn(
          `[EngineDrivenExplorer] Only ${candidates.length} candidate(s) from ${evals.length} evaluations for ${fen}`,
        );
      }
    } catch (e) {
      console.warn(`[EngineDrivenExplorer] Engine evaluation failed: ${e}`);
    }

    // Final check - should never happen if playedMove is valid
    if (candidates.length === 0) {
      console.error(
        `[EngineDrivenExplorer] NO CANDIDATES for position ${fen} (playedMove: ${playedMove})`,
      );
    }

    return candidates;
  }

  /**
   * Calculate priority for a candidate move
   */
  private calculateCandidatePriority(
    moveSan: string,
    playedMove?: string,
    classification?: MoveClassification,
    evalCp?: number,
  ): number {
    let priority = 50;

    // Played move gets high priority (we want to explore what happened)
    if (playedMove && moveSan === playedMove) {
      priority = 80;
      // Even higher for mistakes/blunders (to show refutation)
      if (classification === 'blunder') priority = 95;
      else if (classification === 'mistake') priority = 90;
      else if (classification === 'inaccuracy') priority = 85;
    }

    // Best engine move gets moderate priority
    if (evalCp !== undefined) {
      // Adjust based on how good the move is
      priority = Math.max(priority, 60 + Math.min(20, Math.abs(evalCp) / 50));
    }

    return Math.min(100, priority);
  }

  /**
   * Process a node for both themes and position-based intents
   *
   * This is the main entry point for intent generation. It:
   * 1. Optionally detects themes (if detectThemes is true)
   * 2. Always generates position-based intents based on criticality
   * 3. Combines theme-based and position-based intents
   */
  private processNodeForIntents(
    node: ExplorationNode,
    explainedIdeaKeys: Set<string>,
    detectThemes: boolean,
  ): { themes: ThemeInstance[]; summary: ThemeSummary; intents: CommentIntent[] } {
    let themes: ThemeInstance[] = [];
    let deltas: ThemeDelta[] = [];

    // Optionally run theme detection
    if (detectThemes) {
      const themeResult = this.detectThemesForNode(node);
      themes = themeResult.themes;
      deltas = this.filterDeltasByVerbosity(themeResult.deltas);
    }

    // Build summary (empty if no themes)
    const summary = this.buildThemeSummary(themes, deltas);

    // Generate intents - this now works with or without themes
    const intents = this.generateIntents(node, themes, deltas, explainedIdeaKeys);

    // Update explained idea keys
    for (const intent of intents) {
      for (const ideaKey of intent.content.ideaKeys) {
        explainedIdeaKeys.add(ideaKey.key);
      }
    }

    return { themes, summary, intents };
  }

  /**
   * Detect themes for a node
   */
  private detectThemesForNode(node: ExplorationNode): {
    themes: ThemeInstance[];
    deltas: ThemeDelta[];
  } {
    // Build detector position
    const detectorPosition = this.buildDetectorPosition(node.fen);

    // Build detector context
    const context: DetectorContext = {
      position: detectorPosition,
      ply: node.ply,
      tier: node.tier,
    };

    // Run theme detection
    const detectionResult = this.detectorRegistry.detectAll(context);

    // Process through lifecycle tracker
    return this.lifecycleTracker.processThemes(detectionResult.themes, node.ply);
  }

  /**
   * Generate intents from node data
   *
   * This method generates intents based on:
   * 1. Position characteristics (criticality, exploration priority)
   * 2. Theme transitions (if available)
   * 3. Move quality indicators
   */
  private generateIntents(
    node: ExplorationNode,
    themes: ThemeInstance[],
    deltas: ThemeDelta[],
    explainedIdeaKeys: Set<string>,
  ): CommentIntent[] {
    const intents: CommentIntent[] = [];

    // Calculate criticality for the node
    // Use the node's existing criticality score and boost based on themes
    const criticalityScore: CriticalityScore = calculateCriticality(
      0, // We don't have eval data in exploration context
      0,
      {
        newThemes: deltas.filter((d) => d.transition === 'emerged').length,
      },
    );

    // Use the higher of calculated criticality or node's criticality score
    criticalityScore.score = Math.max(criticalityScore.score, node.criticalityScore);

    // Generate intent if we have interesting content (lowered thresholds from 40/60 to 20/30)
    const hasThemeContent = deltas.length > 0;
    const hasHighCriticality = node.criticalityScore >= 20 || criticalityScore.score >= 20;
    const hasSignificantPriority = node.explorationPriority >= 30;

    // Generate intent for positions with interesting characteristics
    if (hasThemeContent || hasHighCriticality || hasSignificantPriority) {
      const input: IntentInput = {
        move: node.parentMove ?? '',
        moveNumber: Math.floor(node.ply / 2) + 1,
        isWhiteMove: node.ply % 2 === 1,
        plyIndex: node.ply,
        criticalityScore,
        themeDeltas: deltas,
        activeThemes: themes,
        explainedIdeaKeys,
      };

      // Create intent
      const intent = createCommentIntent(input);
      if (intent) {
        intents.push(intent);
      }
    }

    return intents;
  }

  /**
   * Build a DetectorPosition from a FEN string
   */
  private buildDetectorPosition(fen: string): DetectorPosition {
    const parts = fen.split(' ');
    const boardPart = parts[0] ?? '';
    const sideToMove = (parts[1] ?? 'w') as 'w' | 'b';
    const castlingPart = parts[2] ?? '-';
    const enPassantPart = parts[3] ?? '-';
    const halfmoveClock = parseInt(parts[4] ?? '0', 10);
    const fullmoveNumber = parseInt(parts[5] ?? '1', 10);

    // Parse board into 8x8 array
    const board: (string | null)[][] = [];
    const ranks = boardPart.split('/');
    for (const rank of ranks) {
      const row: (string | null)[] = [];
      for (const char of rank) {
        if (char >= '1' && char <= '8') {
          const emptyCount = parseInt(char, 10);
          for (let j = 0; j < emptyCount; j++) {
            row.push(null);
          }
        } else {
          row.push(char);
        }
      }
      board.push(row);
    }

    // Parse castling rights
    const castling = {
      whiteKingside: castlingPart.includes('K'),
      whiteQueenside: castlingPart.includes('Q'),
      blackKingside: castlingPart.includes('k'),
      blackQueenside: castlingPart.includes('q'),
    };

    // Parse en passant
    const enPassant = enPassantPart === '-' ? null : enPassantPart;

    // Build piece lists and find king positions
    const pieces: { white: Map<string, string[]>; black: Map<string, string[]> } = {
      white: new Map(),
      black: new Map(),
    };
    let whiteKingSquare = 'e1';
    let blackKingSquare = 'e8';
    let whiteMaterial = 0;
    let blackMaterial = 0;

    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

    for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
      const row = board[rankIdx];
      if (!row) continue;

      for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
        const piece = row[fileIdx];
        if (piece) {
          const square = files[fileIdx]! + (8 - rankIdx);
          const pieceType = piece.toLowerCase();
          const isWhite = piece === piece.toUpperCase();
          const pieceMap = isWhite ? pieces.white : pieces.black;

          const existing = pieceMap.get(pieceType) ?? [];
          existing.push(square);
          pieceMap.set(pieceType, existing);

          // Track king positions
          if (pieceType === 'k') {
            if (isWhite) whiteKingSquare = square;
            else blackKingSquare = square;
          }

          // Track material
          const value = pieceValues[pieceType] ?? 0;
          if (isWhite) whiteMaterial += value;
          else blackMaterial += value;
        }
      }
    }

    return {
      fen,
      board,
      sideToMove,
      castling,
      enPassant,
      halfmoveClock,
      fullmoveNumber,
      whiteKingSquare,
      blackKingSquare,
      whiteMaterial,
      blackMaterial,
      pieces,
    };
  }

  /**
   * Filter deltas based on theme verbosity setting
   */
  private filterDeltasByVerbosity(deltas: ThemeDelta[]): ThemeDelta[] {
    switch (this.config.themeVerbosity) {
      case 'none':
        return [];
      case 'important':
        return filterSignificantDeltas(deltas, {
          includeEmerged: true,
          includeEscalated: true,
          includeResolved: false,
          minSeverity: 'significant',
        });
      case 'all':
        return filterSignificantDeltas(deltas, {
          includeEmerged: true,
          includeEscalated: true,
          includeResolved: true,
          includeTransformed: true,
          minSeverity: 'moderate',
        });
    }
  }

  /**
   * Build theme summary from themes and deltas
   */
  private buildThemeSummary(themes: ThemeInstance[], deltas: ThemeDelta[]): ThemeSummary {
    const summary: ThemeSummary = {
      activeThemes: themes,
      byCategory: {
        tactical: [],
        structural: [],
        positional: [],
        dynamic: [],
      },
      byBeneficiary: {
        white: [],
        black: [],
      },
      critical: [],
      emerged: [],
      resolved: [],
      totalCount: themes.length,
      totalMaterialAtStake: 0,
    };

    for (const theme of themes) {
      // By category
      const categoryArray = summary.byCategory[theme.category];
      if (categoryArray) {
        categoryArray.push(theme);
      }

      // By beneficiary
      if (theme.beneficiary === 'w') {
        summary.byBeneficiary.white.push(theme);
      } else {
        summary.byBeneficiary.black.push(theme);
      }

      // Critical
      if (theme.severity === 'critical' || theme.severity === 'significant') {
        summary.critical.push(theme);
      }

      // Emerged
      if (theme.status === 'emerged') {
        summary.emerged.push(theme);
      }

      // Material
      if (theme.materialAtStake) {
        summary.totalMaterialAtStake += theme.materialAtStake;
      }
    }

    // Resolved from deltas
    for (const delta of deltas) {
      if (delta.transition === 'resolved') {
        summary.resolved.push(delta.theme);
      }
    }

    return summary;
  }

  /**
   * Convert exploration result to legacy ExploredLine format
   */
  private convertToExploredLines(result: ExplorationResult): ExploredLine[] {
    const lines: ExploredLine[] = [];

    // Convert each variation to an ExploredLine
    for (const variation of result.variations) {
      if (variation.length === 0) continue;

      const line: ExploredLine = {
        moves: variation,
        annotations: new Map(),
        nags: new Map(),
        branches: [],
        purpose: this.determinePurpose(),
        source: 'engine' as LineSource,
      };

      lines.push(line);
    }

    return lines;
  }

  /**
   * Determine the purpose of a line
   */
  private determinePurpose(): LinePurpose {
    // Default to best line
    return 'best';
  }

  /**
   * Convert SAN to UCI using position
   * Note: This is a simplified version that attempts to make the move
   * and derive the UCI from the from/to squares.
   */
  private sanToUci(_position: ChessPosition, san: string): string | undefined {
    // For now, return the SAN as a fallback - proper UCI conversion
    // would require more complex logic or exposing chess.js internals
    return san;
  }

  /**
   * Get resulting FEN after a move
   */
  private getResultingFen(position: ChessPosition, san: string): string | undefined {
    try {
      const cloned = position.clone();
      cloned.move(san);
      return cloned.fen();
    } catch {
      return undefined;
    }
  }

  /**
   * Create a fallback intent for critical moments that produced no intents from exploration
   *
   * This ensures we always have something to annotate for important moves like
   * blunders, mistakes, and inaccuracies even if the exploration didn't find
   * interesting themes or positions.
   */
  private createCriticalMomentIntent(
    move: string,
    fen: string,
    classification: MoveClassification,
  ): CommentIntent | null {
    try {
      const position = new ChessPosition(fen);
      const moveNum = position.moveNumber();
      const turn = position.turn();
      const ply = moveNum * 2 - (turn === 'w' ? 1 : 0);

      // Determine intent type based on classification
      const intentType: CommentIntent['type'] =
        classification === 'blunder'
          ? 'blunder_explanation'
          : classification === 'mistake'
            ? 'what_was_missed'
            : 'critical_moment';

      // Calculate priority based on classification
      const basePriority =
        classification === 'blunder'
          ? 0.9
          : classification === 'mistake'
            ? 0.8
            : classification === 'inaccuracy'
              ? 0.7
              : 0.6;

      return {
        type: intentType,
        plyIndex: ply,
        priority: basePriority,
        mandatory: classification === 'blunder' || classification === 'mistake',
        suggestedLength: classification === 'blunder' ? 'detailed' : 'standard',
        content: {
          move,
          moveNumber: moveNum,
          isWhiteMove: turn === 'b', // After the move, turn has changed
          ideaKeys: [
            {
              key: `fallback_${classification}_${move}`,
              type: 'tactic',
              concept: classification,
            },
          ],
        },
        scoreBreakdown: {
          criticality: basePriority,
          themeNovelty: 0,
          instructionalValue: 0.3,
          redundancyPenalty: 0,
          totalScore: basePriority,
        },
      };
    } catch (e) {
      console.warn(`[EngineDrivenExplorer] Failed to create fallback intent: ${e}`);
      return null;
    }
  }
}

/**
 * Create an engine-driven explorer
 */
export function createEngineDrivenExplorer(
  engine: EngineService,
  cache: ArtifactCache,
  config?: Partial<EngineDrivenExplorerConfig>,
): EngineDrivenExplorer {
  return new EngineDrivenExplorer(engine, cache, config);
}
