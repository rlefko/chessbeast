/**
 * Main orchestrator that coordinates the full analysis pipeline
 */

import { createAnalysisPipeline, type GameAnalysis, type ParsedGameInput } from '@chessbeast/core';
import type { VerbosityLevel, AnnotationProgress } from '@chessbeast/llm';
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
    if (services.annotator && !config.analysis.skipLlm) {
      reporter.startPhase('llm_annotation');
      try {
        const preferredVerbosity = mapVerbosity(config.output.verbosity);

        // Create progress callback for annotation updates
        const onProgress = (progress: AnnotationProgress): void => {
          if (progress.phase === 'annotating' && progress.currentMove) {
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

        const result = await services.annotator.annotate(analysis, {
          preferredVerbosity,
          generateSummary: config.output.includeSummary,
          perspective: config.output.perspective as AnnotationPerspective,
          includeNags: config.output.includeNags,
          onProgress,
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
