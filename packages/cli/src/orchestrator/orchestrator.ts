/**
 * Main orchestrator that coordinates the full analysis pipeline
 */

import { createAnalysisPipeline, type GameAnalysis, type ParsedGameInput } from '@chessbeast/core';
import {
  OpenAIClient,
  createLLMConfig,
  AgenticCommentGenerator,
  AgenticVariationExplorer,
  buildRichContext,
  type VerbosityLevel,
  type AnnotationProgress,
  type DeepAnalysis,
  type AgenticProgress,
  type AgenticServices,
  type StreamChunk,
  type AgenticExplorerProgress,
} from '@chessbeast/llm';
import {
  parsePgn,
  renderPgn,
  transformAnalysisToGame,
  type ParsedGame,
  type MoveInfo,
} from '@chessbeast/pgn';

import type { ChessBeastConfig, OutputVerbosity, AnnotationPerspective } from '../config/schema.js';
import { PgnError, AnalysisError } from '../errors/index.js';
import type { ProgressReporter } from '../progress/reporter.js';
import { createPipelineProgressCallback } from '../progress/reporter.js';

import {
  createEngineAdapter,
  createMaiaAdapter,
  createOpeningAdapter,
  createReferenceGameAdapter,
} from './adapters.js';
import type { Services } from './services.js';

/**
 * Analysis result for a single game
 */
export interface GameResult {
  game: ParsedGame;
  analysis: GameAnalysis;
  annotatedPgn: string;
}

/**
 * Convert ParsedGame to ParsedGameInput for the analysis pipeline
 */
function toAnalysisInput(game: ParsedGame): ParsedGameInput {
  const metadata: ParsedGameInput['metadata'] = {
    white: game.metadata.white,
    black: game.metadata.black,
    result: game.metadata.result,
  };

  // Only add optional properties if they're defined
  if (game.metadata.event !== undefined) metadata.event = game.metadata.event;
  if (game.metadata.date !== undefined) metadata.date = game.metadata.date;
  if (game.metadata.eco !== undefined) metadata.eco = game.metadata.eco;
  if (game.metadata.whiteElo !== undefined) metadata.whiteElo = game.metadata.whiteElo;
  if (game.metadata.blackElo !== undefined) metadata.blackElo = game.metadata.blackElo;

  return {
    metadata,
    moves: game.moves.map((move: MoveInfo) => ({
      san: move.san,
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      moveNumber: move.moveNumber,
      isWhiteMove: move.isWhiteMove,
    })),
  };
}

/**
 * Map output verbosity to LLM verbosity level
 */
function mapVerbosity(verbosity: OutputVerbosity): VerbosityLevel {
  const map: Record<OutputVerbosity, VerbosityLevel> = {
    summary: 'brief',
    normal: 'normal',
    rich: 'detailed',
  };
  return map[verbosity];
}

/**
 * Convert engine evaluation to DeepAnalysis format
 */
function toDeepAnalysis(
  evalData: { cp?: number; mate?: number; depth: number; pv: string[] },
  bestMove: string,
): DeepAnalysis {
  // Convert to centipawns - handle mate scores
  let evaluation: number;
  if (evalData.mate !== undefined && evalData.mate !== 0) {
    // Mate score: use large value with sign
    evaluation = evalData.mate > 0 ? 100000 - evalData.mate * 100 : -100000 - evalData.mate * 100;
  } else {
    evaluation = evalData.cp ?? 0;
  }

  return {
    evaluation,
    bestMove,
    principalVariation: evalData.pv,
    depth: evalData.depth,
  };
}

/**
 * Run agentic annotation with tool calling
 */
async function runAgenticAnnotation(
  analysis: GameAnalysis,
  config: ChessBeastConfig,
  services: Services,
  reporter: ProgressReporter,
): Promise<number> {
  // Build LLM config - use partial type for budget
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const llmConfigInput: any = {
    apiKey: config.llm.apiKey!,
    model: config.llm.model,
    temperature: config.llm.temperature,
    timeout: config.llm.timeout,
    reasoningEffort: config.llm.reasoningEffort,
  };
  if (config.llm.tokenBudget) {
    llmConfigInput.budget = { maxTokensPerGame: config.llm.tokenBudget };
  }
  const llmConfig = createLLMConfig(llmConfigInput);

  // Create OpenAI client
  const client = new OpenAIClient(llmConfig);

  // Build agentic services - need raw clients, not adapters
  if (!services.ecoClient || !services.lichessClient) {
    throw new Error('Agentic mode requires ECO and Lichess databases to be configured');
  }

  const agenticServices: AgenticServices = {
    stockfish: services.stockfish,
    eco: services.ecoClient,
    lichess: services.lichessClient,
  };
  // Only add maia if available (it's optional in AgenticServices)
  if (services.maia) {
    agenticServices.maia = services.maia;
  }

  // Create agentic generator
  const targetRating = config.ratings.targetAudienceRating ?? config.ratings.defaultRating;
  const generator = new AgenticCommentGenerator(client, llmConfig, agenticServices, targetRating);

  // Create agentic explorer if enabled
  let agenticExplorer: AgenticVariationExplorer | undefined;
  if (config.agentic.agenticExploration) {
    agenticExplorer = new AgenticVariationExplorer(client, llmConfig, agenticServices, {
      maxToolCalls: config.agentic.explorationMaxToolCalls,
      maxDepth: config.agentic.explorationMaxDepth,
    });
  }

  // Determine which positions to annotate
  const positionsToAnnotate: number[] = [];
  if (config.agentic.annotateAll) {
    // Annotate all moves
    for (let i = 0; i < analysis.moves.length; i++) {
      positionsToAnnotate.push(i);
    }
  } else {
    // Only annotate critical moments
    for (const cm of analysis.criticalMoments) {
      positionsToAnnotate.push(cm.plyIndex);
    }
  }

  const perspective = config.output.perspective as 'white' | 'black' | 'neutral';
  let annotationCount = 0;

  // Process each position
  for (let i = 0; i < positionsToAnnotate.length; i++) {
    const plyIndex = positionsToAnnotate[i]!;
    const move = analysis.moves[plyIndex];
    if (!move) continue;

    const moveNotation = `${move.moveNumber}${move.isWhiteMove ? '.' : '...'} ${move.san}`;

    // Report progress
    reporter.updateMoveProgress(i + 1, positionsToAnnotate.length, moveNotation);

    // Build rich context for this position
    const currentAnalysis = toDeepAnalysis(move.evalAfter, move.bestMove);
    const previousAnalysis =
      plyIndex > 0
        ? toDeepAnalysis(
            analysis.moves[plyIndex - 1]!.evalAfter,
            analysis.moves[plyIndex - 1]!.bestMove,
          )
        : undefined;

    // Get interestingness score from critical moments
    const criticalMoment = analysis.criticalMoments.find((cm) => cm.plyIndex === plyIndex);
    const interestingnessScore = criticalMoment?.score ?? 50;

    const richContext = buildRichContext(
      move,
      currentAnalysis,
      previousAnalysis,
      targetRating,
      perspective,
      interestingnessScore,
      analysis.metadata.eco && analysis.metadata.openingName
        ? { eco: analysis.metadata.eco, name: analysis.metadata.openingName }
        : undefined,
    );

    // Display move context in debug mode
    // Use evalBefore (position before move) to match fenBefore being displayed
    if (reporter.isDebug()) {
      const beforeAnalysis = toDeepAnalysis(move.evalBefore, move.bestMove);
      reporter.displayMoveContext({
        moveNotation,
        fen: move.fenBefore,
        evaluation: beforeAnalysis.evaluation, // Matches the FEN shown
        bestMove: beforeAnalysis.bestMove,
        classification: move.classification,
        cpLoss: move.cpLoss,
      });
    }

    // Create progress callback for tool calls
    const onProgress = (progress: AgenticProgress): void => {
      if (progress.phase === 'tool_call' && progress.toolName) {
        reporter.displayToolCall(
          moveNotation,
          progress.toolName,
          progress.iteration,
          progress.maxIterations,
        );
        // Debug mode: show full tool arguments
        if (reporter.isDebug() && progress.toolArgs) {
          reporter.displayDebugToolCall(
            progress.toolName,
            progress.toolArgs,
            progress.iteration,
            progress.maxIterations,
          );
        }
      } else if (progress.phase === 'tool_result' && progress.toolName && reporter.isDebug()) {
        // Debug mode: show tool results
        reporter.displayDebugToolResult(
          progress.toolName,
          progress.toolResult,
          progress.toolError,
          progress.toolDurationMs ?? 0,
        );
      }
    };

    // Create streaming callback
    const onChunk = (chunk: StreamChunk): void => {
      if (chunk.type === 'thinking' || chunk.type === 'content') {
        reporter.displayThinking(moveNotation, chunk.text);
        // Debug mode: accumulate full thinking content
        if (reporter.isDebug()) {
          reporter.displayDebugThinking(chunk.text, chunk.done ?? false);
        }
      }
    };

    // Create warning callback that uses spinner-safe output
    const onWarning = (message: string): void => {
      reporter.warnSafe(message);
    };

    // Generate comment
    const result = await generator.generateComment(
      richContext,
      { maxToolCalls: config.agentic.maxToolCalls },
      onProgress,
      onChunk,
      [], // legalMoves - empty for now
      onWarning,
    );

    // Apply comment to move
    if (result.comment.comment) {
      move.comment = result.comment.comment;
      annotationCount++;
    }

    // Explore variations if enabled and this is a critical moment
    if (agenticExplorer && criticalMoment) {
      if (reporter.isDebug()) {
        reporter.displayThinking(moveNotation, 'Starting agentic variation exploration...');
      }

      reporter.updateMoveProgress(
        i + 1,
        positionsToAnnotate.length,
        `${moveNotation} (exploring variations)`,
      );

      // Track last displayed state to avoid duplicate messages
      let lastToolCalls = 0;
      const maxToolCalls = config.agentic.explorationMaxToolCalls ?? 40;

      const explorationResult = await agenticExplorer.explore(
        move.fenAfter,
        targetRating,
        move.san,
        (progress: AgenticExplorerProgress) => {
          // Update progress status for non-debug mode
          reporter.updateMoveProgress(
            i + 1,
            positionsToAnnotate.length,
            `${moveNotation} (exploring: ${progress.toolCalls} tools)`,
          );

          // Rich debug output with chess-friendly formatting
          if (reporter.isDebug() && progress.lastTool && progress.toolCalls > lastToolCalls) {
            // Show chess-friendly tool call with context
            reporter.displayExplorationToolCall(
              moveNotation,
              progress.lastTool,
              progress.toolArgs ?? {},
              progress.toolCalls,
              maxToolCalls,
              {
                currentFen: progress.currentFen,
                currentLine: progress.currentLine,
                depth: progress.currentDepth,
                branchPurpose: progress.branchPurpose,
              },
            );

            // Show chess-friendly result
            if (progress.toolResult !== undefined || progress.toolError) {
              reporter.displayExplorationToolResult(
                progress.lastTool,
                progress.toolResult,
                progress.toolError,
                progress.toolDurationMs ?? 0,
              );
            }

            lastToolCalls = progress.toolCalls;
          }
        },
      );

      // Show completion summary in debug mode
      if (reporter.isDebug()) {
        const varCount = explorationResult.variations.length;
        const annCount = explorationResult.variations.reduce(
          (sum, v) => sum + v.annotations.size,
          0,
        );
        const nagCount = explorationResult.variations.reduce((sum, v) => sum + v.nags.size, 0);
        reporter.displayExplorationComplete({
          toolCalls: explorationResult.toolCalls,
          maxToolCalls,
          branchCount: varCount,
          totalAnnotations: annCount + nagCount,
        });
      }

      // Attach explored variations to move analysis (convert Map to Record for type compatibility)
      if (explorationResult.variations.length > 0) {
        move.exploredVariations = explorationResult.variations.map((v) => ({
          moves: v.moves,
          annotations: Object.fromEntries(v.annotations),
          nags: Object.fromEntries(v.nags),
          purpose: v.purpose,
          source: v.source,
        }));
      }
    }
  }

  return annotationCount;
}

/**
 * Orchestrate the full analysis of a PGN input
 */
export async function orchestrateAnalysis(
  pgnInput: string,
  config: ChessBeastConfig,
  services: Services,
  reporter: ProgressReporter,
): Promise<{
  results: GameResult[];
  stats: {
    gamesAnalyzed: number;
    criticalMoments: number;
    annotationsGenerated: number;
  };
}> {
  // Parse PGN input
  reporter.startPhase('parsing');
  let games: ParsedGame[];
  try {
    games = parsePgn(pgnInput);
  } catch (error) {
    reporter.failPhase('parsing', error instanceof Error ? error.message : 'unknown error');
    if (error instanceof Error && 'line' in error) {
      const pgnError = error as Error & { line?: number; column?: number };
      throw new PgnError(error.message, pgnError.line, pgnError.column);
    }
    throw new PgnError(error instanceof Error ? error.message : 'Failed to parse PGN');
  }
  reporter.completePhase('parsing', `${games.length} game(s)`);

  if (games.length === 0) {
    throw new AnalysisError('No games found in PGN input');
  }

  // Create service adapters
  const engine = createEngineAdapter(services.stockfish);
  const maia = services.maia ? createMaiaAdapter(services.maia) : undefined;
  const openings = services.ecoClient ? createOpeningAdapter(services.ecoClient) : undefined;
  const referenceGames = services.lichessClient
    ? createReferenceGameAdapter(services.lichessClient)
    : undefined;

  // Track stats
  let totalCriticalMoments = 0;
  let totalAnnotations = 0;
  const results: GameResult[] = [];

  // Process each game
  for (let i = 0; i < games.length; i++) {
    const game = games[i]!;
    const totalMoves = Math.ceil(game.moves.length / 2);

    reporter.startGame(i, games.length, game.metadata.white, game.metadata.black, totalMoves);

    // Convert to analysis input
    const input = toAnalysisInput(game);

    // Create progress callback
    const progressCallback = createPipelineProgressCallback(reporter);

    // Create analysis pipeline
    const pipeline = createAnalysisPipeline(
      engine,
      maia,
      openings,
      referenceGames,
      {
        shallowDepth: config.analysis.shallowDepth,
        deepDepth: config.analysis.deepDepth,
        multiPvCount: config.analysis.multiPvCount,
        maxCriticalRatio: config.analysis.maxCriticalRatio,
        whiteRating: config.ratings.targetAudienceRating ?? config.ratings.defaultRating,
        blackRating: config.ratings.targetAudienceRating ?? config.ratings.defaultRating,
        skipMaia: config.analysis.skipMaia,
      },
      progressCallback,
    );

    // Run analysis
    let analysis: GameAnalysis;
    try {
      analysis = await pipeline.analyze(input);
    } catch (error) {
      throw new AnalysisError(
        `Analysis failed for game ${i + 1}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    totalCriticalMoments += analysis.criticalMoments.length;

    // Annotate with LLM if enabled
    if (!config.analysis.skipLlm && config.llm.apiKey) {
      // Use agentic mode if enabled, otherwise use regular annotation
      if (config.agentic.enabled) {
        // Agentic annotation with tool calling
        reporter.startPhase('agentic_annotation');
        try {
          const annotationCount = await runAgenticAnnotation(analysis, config, services, reporter);
          totalAnnotations += annotationCount;
          reporter.completePhase('agentic_annotation', `${annotationCount} annotations`);
        } catch (error) {
          reporter.failPhase(
            'agentic_annotation',
            error instanceof Error ? error.message : 'unknown error',
          );
          // Continue without LLM annotations
        }
      } else if (services.annotator) {
        // Regular LLM annotation
        reporter.startPhase('llm_annotation');
        try {
          const preferredVerbosity = mapVerbosity(config.output.verbosity);

          // Create progress callback for annotation updates
          const onProgress = (progress: AnnotationProgress): void => {
            if (progress.phase === 'exploring' && progress.currentMove) {
              // Show exploration progress
              reporter.updateMoveProgress(
                progress.currentIndex + 1,
                progress.totalPositions,
                `Exploring ${progress.currentMove}`,
              );
            } else if (progress.phase === 'annotating' && progress.currentMove) {
              // Update move progress (always shown)
              reporter.updateMoveProgress(
                progress.currentIndex + 1,
                progress.totalPositions,
                progress.currentMove,
              );

              // Display streaming thinking/content
              if (progress.thinking) {
                reporter.displayThinking(progress.currentMove, progress.thinking);
              }
            }
          };

          // Create warning callback that uses spinner-safe output
          const onWarning = (message: string): void => {
            reporter.warnSafe(message);
          };

          const result = await services.annotator.annotate(analysis, {
            preferredVerbosity,
            generateSummary: config.output.includeSummary,
            perspective: config.output.perspective as AnnotationPerspective,
            includeNags: config.output.includeNags,
            onProgress,
            onWarning,
          });
          analysis = result.analysis;
          totalAnnotations += result.positionsAnnotated;
          reporter.completePhase('llm_annotation', `${result.positionsAnnotated} annotations`);
        } catch (error) {
          reporter.failPhase(
            'llm_annotation',
            error instanceof Error ? error.message : 'unknown error',
          );
          // Continue without LLM annotations
        }
      }
    }

    // Transform to annotated PGN
    reporter.startPhase('rendering');
    const annotatedGame = transformAnalysisToGame(analysis, {
      includeVariations: config.output.includeVariations,
      includeNags: config.output.includeNags,
      includeSummary: config.output.includeSummary,
    });
    const annotatedPgn = renderPgn(annotatedGame);
    reporter.completePhase('rendering');

    results.push({
      game,
      analysis,
      annotatedPgn,
    });

    reporter.completeGame(i, games.length);
  }

  return {
    results,
    stats: {
      gamesAnalyzed: results.length,
      criticalMoments: totalCriticalMoments,
      annotationsGenerated: totalAnnotations,
    },
  };
}
