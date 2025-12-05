/**
 * Agentic annotation runner
 * Extracted from orchestrator for SRP compliance
 */

import type { GameAnalysis } from '@chessbeast/core';
import {
  OpenAIClient,
  createLLMConfig,
  AgenticCommentGenerator,
  AgenticVariationExplorer,
  buildRichContext,
  assessExplorationWorthiness,
  formatPositionCardConcise,
  type AgenticProgress,
  type AgenticServices,
  type StreamChunk,
  type AgenticExplorerProgress,
  type ExploredLine,
} from '@chessbeast/llm';
import type { ExploredVariation } from '@chessbeast/pgn';

import type { ChessBeastConfig } from '../config/schema.js';
import type { ProgressReporter } from '../progress/reporter.js';

import { toDeepAnalysis } from './converters.js';
import type { Services } from './services.js';

/**
 * Recursively convert ExploredLine to ExploredVariation
 * Preserves nested branches and converts Map to Record
 */
function convertExploredLine(line: ExploredLine): ExploredVariation {
  const result: ExploredVariation = {
    moves: line.moves,
    annotations: Object.fromEntries(line.annotations),
    nags: Object.fromEntries(line.nags),
    purpose: line.purpose,
    source: line.source,
  };
  if (line.finalEval) {
    result.finalEval = line.finalEval;
  }
  if (line.branches && line.branches.length > 0) {
    result.branches = line.branches.map(convertExploredLine);
  }
  return result;
}

/**
 * Run agentic annotation with tool calling
 */
export async function runAgenticAnnotation(
  analysis: GameAnalysis,
  config: ChessBeastConfig,
  services: Services,
  reporter: ProgressReporter,
): Promise<number> {
  // Build LLM config
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

  const client = new OpenAIClient(llmConfig);

  if (!services.ecoClient || !services.lichessClient) {
    throw new Error('Agentic mode requires ECO and Lichess databases to be configured');
  }

  const agenticServices: AgenticServices = {
    stockfish: services.stockfish,
    eco: services.ecoClient,
    lichess: services.lichessClient,
  };
  if (services.maia) {
    agenticServices.maia = services.maia;
  }
  if (services.sf16) {
    agenticServices.sf16 = services.sf16;
  }

  const targetRating = config.ratings.targetAudienceRating ?? config.ratings.defaultRating;
  const generator = new AgenticCommentGenerator(client, llmConfig, agenticServices, targetRating);

  let agenticExplorer: AgenticVariationExplorer | undefined;
  if (config.agentic.agenticExploration) {
    agenticExplorer = new AgenticVariationExplorer(client, llmConfig, agenticServices, {
      maxToolCalls: config.agentic.explorationMaxToolCalls,
      maxDepth: config.agentic.explorationMaxDepth,
    });
  }

  const positionsToAnnotate: number[] = [];
  if (config.agentic.annotateAll) {
    for (let i = 0; i < analysis.moves.length; i++) {
      positionsToAnnotate.push(i);
    }
  } else {
    for (const cm of analysis.criticalMoments) {
      positionsToAnnotate.push(cm.plyIndex);
    }
  }

  const perspective = config.output.perspective as 'white' | 'black' | 'neutral';
  let annotationCount = 0;

  for (let i = 0; i < positionsToAnnotate.length; i++) {
    const plyIndex = positionsToAnnotate[i]!;
    const move = analysis.moves[plyIndex];
    if (!move) continue;

    const moveNotation = `${move.moveNumber}${move.isWhiteMove ? '.' : '...'} ${move.san}`;
    reporter.updateMoveProgress(i + 1, positionsToAnnotate.length, moveNotation);

    const currentAnalysis = toDeepAnalysis(move.evalAfter, move.bestMove);
    const previousAnalysis =
      plyIndex > 0
        ? toDeepAnalysis(
            analysis.moves[plyIndex - 1]!.evalAfter,
            analysis.moves[plyIndex - 1]!.bestMove,
          )
        : undefined;

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

    if (reporter.isDebug()) {
      const beforeAnalysis = toDeepAnalysis(move.evalBefore, move.bestMove);
      reporter.displayMoveContext({
        moveNotation,
        fen: move.fenBefore,
        evaluation: beforeAnalysis.evaluation,
        bestMove: beforeAnalysis.bestMove,
        classification: move.classification,
        cpLoss: move.cpLoss,
      });
    }

    const onProgress = (progress: AgenticProgress): void => {
      if (progress.phase === 'tool_call' && progress.toolName) {
        reporter.displayToolCall(
          moveNotation,
          progress.toolName,
          progress.iteration,
          progress.maxIterations,
        );
        if (reporter.isDebug() && progress.toolArgs) {
          reporter.displayDebugToolCall(
            progress.toolName,
            progress.toolArgs,
            progress.iteration,
            progress.maxIterations,
          );
        }
      } else if (progress.phase === 'tool_result' && progress.toolName && reporter.isDebug()) {
        reporter.displayDebugToolResult(
          progress.toolName,
          progress.toolResult,
          progress.toolError,
          progress.toolDurationMs ?? 0,
        );
      }
    };

    const onChunk = (chunk: StreamChunk): void => {
      if (chunk.type === 'thinking' || chunk.type === 'content') {
        reporter.displayThinking(moveNotation, chunk.text);
        if (reporter.isDebug()) {
          reporter.displayDebugThinking(chunk.text, chunk.done ?? false);
        }
      }
    };

    const onWarning = (message: string): void => {
      reporter.warnSafe(message);
    };

    const result = await generator.generateComment(
      richContext,
      { maxToolCalls: config.agentic.maxToolCalls },
      onProgress,
      onChunk,
      [],
      onWarning,
    );

    reporter.endThinking();

    if (result.comment.comment) {
      move.comment = result.comment.comment;
      annotationCount++;
    }

    if (agenticExplorer && criticalMoment) {
      const variationResult = await runVariationExploration(
        agenticExplorer,
        move,
        moveNotation,
        i,
        positionsToAnnotate.length,
        targetRating,
        config,
        reporter,
      );

      if (variationResult.length > 0) {
        move.exploredVariations = variationResult;
      }
    }
  }

  return annotationCount;
}

async function runVariationExploration(
  agenticExplorer: AgenticVariationExplorer,
  move: GameAnalysis['moves'][0],
  moveNotation: string,
  positionIndex: number,
  totalPositions: number,
  targetRating: number,
  config: ChessBeastConfig,
  reporter: ProgressReporter,
): Promise<ExploredVariation[]> {
  const worthiness = assessExplorationWorthiness(
    move.fenBefore,
    move.evalBefore.cp ?? 0,
    move.evalBefore.mate,
    move.classification,
    move.san,
    move.bestMove,
  );

  if (!worthiness.shouldExplore) {
    if (reporter.isDebug()) {
      reporter.displayThinking(moveNotation, `Skipping exploration: ${worthiness.reason}\n`);
    }
    return [];
  }

  if (reporter.isDebug()) {
    const budgetInfo =
      worthiness.budgetMultiplier < 1.0
        ? ` (${Math.round(worthiness.budgetMultiplier * 100)}% budget)`
        : '';
    reporter.displayThinking(
      moveNotation,
      `Starting exploration: ${worthiness.reason}${budgetInfo}\n`,
    );
  }

  reporter.updateMoveProgress(
    positionIndex + 1,
    totalPositions,
    `${moveNotation} (exploring variations)`,
  );

  let lastToolCalls = 0;
  const baseMaxToolCalls = config.agentic.explorationMaxToolCalls ?? 40;
  const maxToolCalls = Math.max(20, Math.floor(baseMaxToolCalls * worthiness.budgetMultiplier));

  const explorationResult = await agenticExplorer.explore(
    move.fenBefore,
    targetRating,
    move.san,
    move.classification,
    (progress: AgenticExplorerProgress) => {
      reporter.updateMoveProgress(
        positionIndex + 1,
        totalPositions,
        `${moveNotation} (exploring: ${progress.toolCalls} tools, ${progress.nodeCount} nodes)`,
      );

      // Display position card if available (debug mode only)
      if (reporter.isDebug() && progress.positionCard) {
        reporter.displayPositionCard(formatPositionCardConcise(progress.positionCard));
      }

      if (reporter.isDebug() && progress.lastTool && progress.toolCalls > lastToolCalls) {
        reporter.displayExplorationToolCall(
          moveNotation,
          progress.lastTool,
          progress.toolArgs ?? {},
          progress.toolCalls,
          maxToolCalls,
          {
            currentFen: progress.currentFen,
            currentLine: progress.currentSan ? [progress.currentSan] : undefined,
            depth: progress.nodeCount,
            branchPurpose: progress.phase,
          },
        );

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
    undefined,
    move.evalBefore.cp,
  );

  if (reporter.isDebug()) {
    const varCount = explorationResult.variations.length;
    const annCount = explorationResult.variations.reduce(
      (sum, v) => sum + (v.annotations?.size ?? 0),
      0,
    );
    const nagCount = explorationResult.variations.reduce((sum, v) => sum + (v.nags?.size ?? 0), 0);
    reporter.displayExplorationComplete({
      toolCalls: explorationResult.toolCalls,
      maxToolCalls,
      branchCount: varCount,
      totalAnnotations: annCount + nagCount,
    });
  }

  const subExplorations = await runSubExplorations(
    agenticExplorer,
    explorationResult.markedSubPositions ?? [],
    moveNotation,
    positionIndex,
    totalPositions,
    targetRating,
    maxToolCalls,
    reporter,
  );

  const allVariations = [...explorationResult.variations, ...subExplorations];
  return allVariations.map(convertExploredLine);
}

async function runSubExplorations(
  agenticExplorer: AgenticVariationExplorer,
  markedSubPositions: Array<{ fen: string; reason: string; priority: 'high' | 'medium' | 'low' }>,
  moveNotation: string,
  positionIndex: number,
  totalPositions: number,
  targetRating: number,
  maxToolCalls: number,
  reporter: ProgressReporter,
): Promise<ExploredLine[]> {
  if (markedSubPositions.length === 0) {
    return [];
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sortedSubPositions = [...markedSubPositions].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
  );

  const maxSubExplorations = 3;
  const subPositionsToExplore = sortedSubPositions.slice(0, maxSubExplorations);

  if (reporter.isDebug() && subPositionsToExplore.length > 0) {
    reporter.displayThinking(
      moveNotation,
      `Processing ${subPositionsToExplore.length} sub-exploration(s)...`,
    );
  }

  const subExplorations: ExploredLine[] = [];

  for (let subIdx = 0; subIdx < subPositionsToExplore.length; subIdx++) {
    const subPosition = subPositionsToExplore[subIdx]!;

    reporter.updateMoveProgress(
      positionIndex + 1,
      totalPositions,
      `${moveNotation} (sub-exploration ${subIdx + 1}/${subPositionsToExplore.length}: ${subPosition.reason})`,
    );

    const subResult = await agenticExplorer.explore(
      subPosition.fen,
      targetRating,
      undefined,
      undefined,
      (progress: AgenticExplorerProgress) => {
        reporter.updateMoveProgress(
          positionIndex + 1,
          totalPositions,
          `${moveNotation} (sub ${subIdx + 1}: ${progress.toolCalls} tools)`,
        );

        // Display position card if available (debug mode only)
        if (reporter.isDebug() && progress.positionCard) {
          reporter.displayPositionCard(formatPositionCardConcise(progress.positionCard));
        }

        if (reporter.isDebug() && progress.lastTool && progress.toolCalls > 0) {
          reporter.displayExplorationToolCall(
            `${moveNotation} [sub]`,
            progress.lastTool,
            progress.toolArgs ?? {},
            progress.toolCalls,
            Math.floor(maxToolCalls / 2),
            {
              currentFen: progress.currentFen,
              currentLine: progress.currentSan ? [progress.currentSan] : undefined,
              depth: progress.nodeCount,
              branchPurpose: `sub: ${subPosition.reason}`,
            },
          );
        }
      },
    );

    if (subResult.variations.length > 0) {
      subExplorations.push(...subResult.variations);
    }
  }

  return subExplorations;
}
