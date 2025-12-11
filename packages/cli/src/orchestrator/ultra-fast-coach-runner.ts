/**
 * Ultra-Fast Coach runner
 *
 * Runs the new engine-driven exploration and post-write annotation pipeline.
 * This is the main entry point for the Ultra-Fast Coach architecture.
 *
 * Architecture:
 * - Engine explores via PriorityQueueExplorer (no LLM calls during exploration)
 * - Themes are detected at each explored node
 * - Comment intents are generated based on themes and position analysis
 * - LLM generates comments post-write (1 call per comment)
 */

import {
  createArtifactCache,
  createVariationDAG,
  type GameAnalysis,
  type VariationDAG,
} from '@chessbeast/core';
import {
  OpenAIClient,
  createLLMConfig,
  createEngineDrivenExplorer,
  createPostWritePipeline,
  type EngineDrivenExplorerProgress,
  type PostWritePipelineProgress,
  type ThemeVerbosity,
  type AudienceLevel,
  type DensityLevel,
  type CommentIntent,
  type ThemeInstance,
} from '@chessbeast/llm';
import { transformDagToMoves, ChessPosition, type MoveInfo } from '@chessbeast/pgn';

import type { ChessBeastConfig } from '../config/schema.js';
import type { ProgressReporter } from '../progress/reporter.js';

import { createEngineAdapter } from './adapters.js';
import type { Services } from './services.js';
import { createUltraFastCoachConfig } from './ultra-fast-coach.js';

/**
 * Result from Ultra-Fast Coach annotation runner
 */
export interface UltraFastCoachRunnerResult {
  /** Number of comments generated */
  commentsGenerated: number;

  /** Number of nodes explored */
  nodesExplored: number;

  /** Total tokens used */
  tokensUsed: number;

  /** Annotated moves (can be used to replace analysis.moves) */
  annotatedMoves: MoveInfo[];

  /** Warnings during processing */
  warnings: string[];
}

/**
 * Run Ultra-Fast Coach annotation
 *
 * @param analysis - The analyzed game
 * @param config - CLI configuration
 * @param services - Available services
 * @param reporter - Progress reporter
 * @returns Number of annotations generated
 */
export async function runUltraFastCoachAnnotation(
  analysis: GameAnalysis,
  config: ChessBeastConfig,
  services: Services,
  reporter: ProgressReporter,
): Promise<number> {
  const result = await runUltraFastCoachFull(analysis, config, services, reporter);

  // Apply comments AND variations from DAG to analysis moves
  for (const annotatedMove of result.annotatedMoves) {
    const plyIndex = (annotatedMove.moveNumber - 1) * 2 + (annotatedMove.isWhiteMove ? 0 : 1);
    const analysisMove = analysis.moves[plyIndex];
    if (analysisMove) {
      if (annotatedMove.commentAfter) {
        analysisMove.comment = annotatedMove.commentAfter;
      }
      // Apply variations from the explored DAG (replaces legacy alternatives)
      if (annotatedMove.variations && annotatedMove.variations.length > 0) {
        analysisMove.exploredVariations = annotatedMove.variations.map((varLine) => {
          // Extract SAN moves from MoveInfo objects
          const moves = varLine.map((m) => m.san);
          // Build annotations map from any comments in the variation
          const annotations: Record<number, string> = {};
          varLine.forEach((m, idx) => {
            if (m.commentAfter) {
              annotations[idx] = m.commentAfter;
            }
          });
          return {
            moves,
            ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
            purpose: 'best' as const,
            source: 'engine' as const,
          };
        });
      }
    }
  }

  return result.commentsGenerated;
}

/**
 * Run the full Ultra-Fast Coach pipeline and return detailed results
 */
export async function runUltraFastCoachFull(
  analysis: GameAnalysis,
  config: ChessBeastConfig,
  services: Services,
  reporter: ProgressReporter,
): Promise<UltraFastCoachRunnerResult> {
  const warnings: string[] = [];

  // Build LLM config (conditionally add reasoningEffort)
  const llmConfigInput: Parameters<typeof createLLMConfig>[0] = {
    apiKey: config.llm.apiKey!,
    model: config.llm.model,
    temperature: config.llm.temperature,
    timeout: config.llm.timeout,
  };
  if (config.llm.reasoningEffort !== undefined) {
    llmConfigInput.reasoningEffort = config.llm.reasoningEffort;
  }
  const llmConfig = createLLMConfig(llmConfigInput);

  const client = new OpenAIClient(llmConfig);

  // Get Ultra-Fast Coach config
  const coachConfig = createUltraFastCoachConfig(config.ultraFastCoach);

  // Create artifact cache with tier-based sizing
  const cache = createArtifactCache({
    maxEngineEvals: coachConfig.defaultTier === 'full' ? 5000 : 2000,
    maxThemes: coachConfig.defaultTier === 'full' ? 3000 : 1000,
    maxCandidates: coachConfig.defaultTier === 'full' ? 2000 : 500,
    ttlMs: 3600000, // 1 hour
  });

  // Create engine adapter for the explorer
  const engineAdapter = createEngineAdapter(services.stockfish);

  // Determine theme verbosity and audience from config
  const themeVerbosity: ThemeVerbosity = coachConfig.themes.verbosity;
  const audience = (coachConfig.narration.audience ?? 'club') as AudienceLevel;
  const targetRating = config.ratings.targetAudienceRating ?? config.ratings.defaultRating;

  // Create the SHARED DAG upfront with mainline moves
  // This ensures explored variations are added to the same DAG as the mainline
  const startingFen =
    analysis.moves[0]?.fenBefore ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const sharedDag: VariationDAG = createVariationDAG(startingFen);

  // Add the main line FIRST (so principal path is established)
  // Derive UCI from SAN for each move to ensure edge deduplication works correctly
  const currentPosition = new ChessPosition(startingFen);
  for (const move of analysis.moves) {
    const moveUci = currentPosition.sanToUci(move.san);
    sharedDag.addMove(move.san, moveUci, move.fenAfter, 'mainline', { makePrincipal: true });
    currentPosition.move(move.san);
  }

  // Create the explorer with the shared DAG
  // The explorer will navigate to each critical position and add variations there
  const explorer = createEngineDrivenExplorer(engineAdapter, cache, {
    maxNodes: coachConfig.variations.maxNodes,
    maxDepth: coachConfig.variations.maxDepth,
    budgetMs: coachConfig.defaultTier === 'full' ? 120000 : 60000,
    detectThemes: coachConfig.themes.enabled,
    themeVerbosity,
    audience,
    targetRating,
    sharedDag, // Pass the shared DAG so explored variations are integrated
  });

  // Phase 1: Engine-driven exploration (using deep_analysis phase)
  reporter.startPhase('deep_analysis');

  let totalNodesExplored = 0;
  const allIntents: CommentIntent[] = [];
  const allThemes = new Map<string, ThemeInstance[]>();

  // Explore critical moments
  const maxCriticalMoves = Math.floor(config.analysis.maxCriticalRatio * analysis.moves.length);
  const criticalMoments = analysis.criticalMoments.slice(0, maxCriticalMoves);

  for (let i = 0; i < criticalMoments.length; i++) {
    const moment = criticalMoments[i]!;
    const move = analysis.moves[moment.plyIndex];
    if (!move) continue;

    const moveNotation = `${move.moveNumber}${move.isWhiteMove ? '.' : '...'} ${move.san}`;
    reporter.updateMoveProgress(i + 1, criticalMoments.length, `Exploring ${moveNotation}`);

    try {
      // Pass the plyIndex so intents are attached to the correct move
      const explorationResult = await explorer.explore(
        move.fenBefore,
        move.san,
        move.classification,
        (progress: EngineDrivenExplorerProgress) => {
          reporter.updateMoveProgress(
            i + 1,
            criticalMoments.length,
            `${moveNotation}: ${progress.nodesExplored} nodes`,
          );
        },
        moment.plyIndex, // Pass the game ply for correct intent placement
      );

      totalNodesExplored += explorationResult.nodesExplored;
      allIntents.push(...explorationResult.intents);

      // Merge themes
      for (const [key, themes] of explorationResult.themes) {
        const existing = allThemes.get(key);
        if (existing) {
          allThemes.set(key, [...existing, ...themes]);
        } else {
          allThemes.set(key, themes);
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      warnings.push(`Exploration failed for ${moveNotation}: ${errMsg}`);
    }
  }

  reporter.completePhase('deep_analysis', `${totalNodesExplored} nodes explored`);

  // Phase 2: Post-write annotation (using llm_annotation phase)
  reporter.startPhase('llm_annotation');

  const pipeline = createPostWritePipeline(client, {
    narrator: {
      audience,
      maxWordsPerComment: 50,
      includeVariations: coachConfig.variations.depth !== 'low',
      showEvaluations: false,
    },
    density: coachConfig.density as DensityLevel,
    lineMemory: coachConfig.lineMemory,
    maxCommentsPerGame: 30,
    useLlm: true,
  });

  const pipelineResult = await pipeline.annotate(
    {
      intents: allIntents,
      totalPlies: analysis.moves.length,
    },
    (progress: PostWritePipelineProgress) => {
      if (progress.phase === 'narrating') {
        reporter.updateMoveProgress(
          progress.intentsProcessed,
          progress.totalIntents,
          progress.currentComment ?? 'Generating comments...',
        );
      }
    },
    (warning: string) => {
      warnings.push(warning);
    },
  );

  reporter.completePhase('llm_annotation', `${pipelineResult.stats.commentsGenerated} comments`);

  // Transform the shared DAG (which now contains mainline + explored variations) to moves
  // Navigate to root first to ensure we start from the beginning
  sharedDag.goToRoot();
  const annotatedMoves = transformDagToMoves(sharedDag, {
    comments: pipelineResult.comments,
    nags: pipelineResult.nags,
  });

  return {
    commentsGenerated: pipelineResult.stats.commentsGenerated,
    nodesExplored: totalNodesExplored,
    tokensUsed: pipelineResult.stats.tokensUsed,
    annotatedMoves,
    warnings: [...warnings, ...pipelineResult.warnings],
  };
}
