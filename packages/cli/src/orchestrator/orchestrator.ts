/**
 * Main orchestrator that coordinates the full analysis pipeline
 * Refactored to delegate to extracted components for SRP compliance
 */

import { createAnalysisPipeline, type GameAnalysis } from '@chessbeast/core';
import { type VerbosityLevel, type AnnotationProgress } from '@chessbeast/llm';
import {
  parsePgn,
  renderPgn,
  transformAnalysisToGame,
  validateAndFixPgn,
  type ParsedGame,
} from '@chessbeast/pgn';

import type { ChessBeastConfig, AnnotationPerspective } from '../config/schema.js';
import { PgnError, AnalysisError } from '../errors/index.js';
import type { ProgressReporter } from '../progress/reporter.js';
import { createPipelineProgressCallback } from '../progress/reporter.js';

import {
  createEngineAdapter,
  createMaiaAdapter,
  createOpeningAdapter,
  createReferenceGameAdapter,
} from './adapters.js';
import { runAgenticAnnotation } from './agentic-runner.js';
import { toAnalysisInput } from './converters.js';
import type { Services } from './services.js';
import { runUltraFastCoachAnnotation } from './ultra-fast-coach-runner.js';
import { createUltraFastCoachConfig, getUltraFastTierConfig } from './ultra-fast-coach.js';

/**
 * Analysis result for a single game
 */
export interface GameResult {
  game: ParsedGame;
  analysis: GameAnalysis;
  annotatedPgn: string;
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

    // Create Ultra-Fast Coach config and get tier settings
    const coachConfig = createUltraFastCoachConfig(config.ultraFastCoach);
    const tierConfigs = getUltraFastTierConfig(coachConfig);
    const defaultTierConfig = tierConfigs[coachConfig.defaultTier];

    // Create analysis pipeline with tier-based settings
    // Note: maxCriticalRatio comes from analysis config, not coach config,
    // to allow explicit overrides in tests and CLI
    const pipeline = createAnalysisPipeline(
      engine,
      maia,
      openings,
      referenceGames,
      {
        shallowDepth: tierConfigs.shallow.depth ?? config.analysis.shallowDepth,
        deepDepth: defaultTierConfig.depth ?? config.analysis.deepDepth,
        multiPvCount: defaultTierConfig.multipv ?? config.analysis.multiPvCount,
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
      if (config.ultraFastCoach.enabled) {
        // Ultra-Fast Coach annotation with engine-driven exploration
        reporter.startPhase('llm_annotation');
        try {
          const annotationCount = await runUltraFastCoachAnnotation(
            analysis,
            config,
            services,
            reporter,
          );
          totalAnnotations += annotationCount;
          reporter.completePhase('llm_annotation', `${annotationCount} annotations`);
        } catch (error) {
          reporter.failPhase(
            'llm_annotation',
            error instanceof Error ? error.message : 'unknown error',
          );
        }
      } else if (config.agentic.enabled) {
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
        }
      } else if (services.annotator) {
        // Regular LLM annotation
        reporter.startPhase('llm_annotation');
        try {
          const preferredVerbosity: VerbosityLevel = 'normal';

          const onProgress = (progress: AnnotationProgress): void => {
            if (progress.phase === 'exploring' && progress.currentMove) {
              reporter.updateMoveProgress(
                progress.currentIndex + 1,
                progress.totalPositions,
                `Exploring ${progress.currentMove}`,
              );
            } else if (progress.phase === 'annotating' && progress.currentMove) {
              reporter.updateMoveProgress(
                progress.currentIndex + 1,
                progress.totalPositions,
                progress.currentMove,
              );

              if (progress.thinking) {
                reporter.displayThinking(progress.currentMove, progress.thinking);
              }
            }
          };

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

    // Validate and auto-fix PGN structure issues
    const { fixed: fixedGame, warnings: fixWarnings } = validateAndFixPgn(annotatedGame);
    for (const warning of fixWarnings) {
      reporter.warn(warning);
    }

    const annotatedPgn = renderPgn(fixedGame);
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
