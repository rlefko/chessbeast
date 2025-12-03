/**
 * Progress reporter with ora spinners
 * Refactored to delegate to extracted components for SRP compliance
 */

import chalk from 'chalk';
import ora, { type Ora, type Color } from 'ora';

import { DebugOutput, type MoveContext } from './debug-output.js';
import { formatTokenCount, formatCost } from './eval-formatter.js';
import { ExplorationDisplay, type ExplorationContext } from './exploration-display.js';
import { formatEta } from './formatters.js';
import { TimeEstimator } from './time-estimator.js';
import {
  type AnalysisPhase,
  type ColorFunctions,
  type ProgressReporterOptions,
  type ServiceStatus,
  PHASE_NAMES,
} from './types.js';

// Re-export types for backwards compatibility
export type { AnalysisPhase, ServiceStatus, ProgressReporterOptions } from './types.js';

// Helper function for colorized output
function createColorFns(useColor: boolean): ColorFunctions {
  if (useColor) {
    return {
      bold: (text: string) => chalk.bold(text),
      dim: (text: string) => chalk.dim(text),
      green: (text: string) => chalk.green(text),
      red: (text: string) => chalk.red(text),
      yellow: (text: string) => chalk.yellow(text),
      cyan: (text: string) => chalk.cyan(text),
    };
  }
  // No colors - return text as-is
  const identity = (text: string): string => text;
  return {
    bold: identity,
    dim: identity,
    green: identity,
    red: identity,
    yellow: identity,
    cyan: identity,
  };
}

/**
 * Progress reporter for CLI output
 */
export class ProgressReporter {
  private spinner: Ora | null = null;
  private startTime: number = 0;
  private phaseStartTime: number = 0;
  private silent: boolean;
  private useColor: boolean;
  private verbose: boolean;
  private debug: boolean;
  private timeEstimator: TimeEstimator;
  private currentPhaseName: string = '';
  private thinkingBuffer: string = '';

  // LLM waiting timer - shows elapsed time while waiting for response
  private llmWaitingTimer: NodeJS.Timeout | null = null;
  private llmWaitingStartTime: number = 0;

  // Color functions
  private c: ColorFunctions;

  // Extracted components (lazy initialized)
  private _debugOutput: DebugOutput | null = null;
  private _explorationDisplay: ExplorationDisplay | null = null;

  constructor(options: ProgressReporterOptions | boolean = {}) {
    // Handle legacy boolean argument for backwards compatibility
    if (typeof options === 'boolean') {
      this.silent = options;
      this.useColor = true;
      this.verbose = false;
      this.debug = false;
    } else {
      this.silent = options.silent ?? false;
      this.useColor = options.color ?? true;
      this.debug = options.debug ?? false;
      // debug implies verbose
      this.verbose = options.verbose ?? this.debug;
    }

    this.timeEstimator = new TimeEstimator();

    // Create color functions based on color setting
    this.c = createColorFns(this.useColor);
  }

  // Lazy getter for debug output handler
  private get debugOutput(): DebugOutput {
    if (!this._debugOutput) {
      this._debugOutput = new DebugOutput(this.c, () => this.spinner);
    }
    return this._debugOutput;
  }

  // Lazy getter for exploration display handler
  private get explorationDisplay(): ExplorationDisplay {
    if (!this._explorationDisplay) {
      this._explorationDisplay = new ExplorationDisplay(this.c, () => this.spinner);
    }
    return this._explorationDisplay;
  }

  /**
   * Print the version header
   */
  printHeader(version: string): void {
    if (this.silent) return;
    console.log(this.c.bold(`ChessBeast v${version}`));
    console.log('');
  }

  /**
   * Display a warning message
   */
  warn(message: string): void {
    if (this.silent) return;
    console.log(this.c.yellow(`⚠ ${message}`));
  }

  /**
   * Start the overall analysis
   */
  startAnalysis(): void {
    this.startTime = Date.now();
  }

  /**
   * Report service health check results
   */
  reportServiceStatus(services: ServiceStatus[]): void {
    if (this.silent) return;

    console.log(this.c.dim('Checking services...'));
    for (const service of services) {
      const status = service.healthy ? this.c.green('✓') : this.c.red('✗');
      const latency =
        service.latencyMs !== undefined ? this.c.dim(` - ${service.latencyMs}ms`) : '';
      const error = service.error ? this.c.red(` (${service.error})`) : '';

      console.log(`  ${status} ${service.name}${latency}${error}`);
    }
    console.log('');
  }

  /**
   * Start analyzing a game
   */
  startGame(
    gameIndex: number,
    totalGames: number,
    white: string,
    black: string,
    totalMoves: number,
  ): void {
    if (this.silent) return;

    const gameLabel = totalGames > 1 ? `game ${gameIndex + 1}/${totalGames}` : 'game';
    console.log(this.c.bold(`Analyzing ${gameLabel}: ${white} vs ${black} (${totalMoves} moves)`));
  }

  /**
   * Start a new analysis phase
   */
  startPhase(phase: AnalysisPhase): void {
    if (this.silent) return;

    this.phaseStartTime = Date.now();
    this.currentPhaseName = PHASE_NAMES[phase];

    // Reset time estimator for new phase
    this.timeEstimator.reset();

    // Stop any existing spinner
    if (this.spinner) {
      this.spinner.stop();
    }

    // Build ora options - only include color if colors are enabled
    const oraOptions: { text: string; prefixText: string; color?: Color } = {
      text: this.currentPhaseName,
      prefixText: '  ',
    };
    if (this.useColor) {
      oraOptions.color = 'cyan';
    }

    this.spinner = ora(oraOptions).start();
  }

  /**
   * Update phase progress with move counter and ETA
   */
  updateProgress(current: number, total: number): void {
    if (this.silent || !this.spinner) return;

    // Record sample for ETA estimation
    this.timeEstimator.record(current);

    // Calculate ETA
    const etaMs = this.timeEstimator.estimateRemaining(current, total);
    const etaStr = etaMs !== null ? this.c.dim(` (${formatEta(etaMs)} remaining)`) : '';

    // Build progress string
    const progressStr = `${current}/${total}`;

    this.spinner.text = `${this.currentPhaseName}... ${progressStr}${etaStr}`;
  }

  /**
   * Update progress for move annotation with move notation
   * Shows "Analyzing 14... Be6 (3/8)" in the spinner, then starts
   * a timer that shows elapsed time while waiting for LLM response.
   */
  updateMoveProgress(current: number, total: number, moveNotation: string): void {
    if (this.silent || !this.spinner) return;

    // Stop any existing waiting timer from previous move
    this.stopLlmWaitingTimer();

    // Reset thinking buffer when starting a new move
    this.thinkingBuffer = '';

    // Record sample for ETA estimation
    this.timeEstimator.record(current);

    // Calculate ETA
    const etaMs = this.timeEstimator.estimateRemaining(current, total);
    const etaStr = etaMs !== null ? this.c.dim(` (${formatEta(etaMs)} remaining)`) : '';

    // Build progress string with move notation
    const progressStr = `(${current}/${total})`;

    this.spinner.text = `Analyzing ${this.c.cyan(moveNotation)} ${progressStr}${etaStr}`;

    // Start timer to show elapsed time while waiting for LLM response
    this.startLlmWaitingTimer(moveNotation, progressStr);
  }

  /**
   * Start the LLM waiting timer that updates spinner with elapsed time
   */
  private startLlmWaitingTimer(moveNotation: string, progressStr: string): void {
    this.llmWaitingStartTime = Date.now();

    // Update every second to show elapsed time
    this.llmWaitingTimer = setInterval(() => {
      if (!this.spinner) return;
      const elapsed = Math.floor((Date.now() - this.llmWaitingStartTime) / 1000);
      this.spinner.text = `Analyzing ${this.c.cyan(moveNotation)} ${progressStr} ${this.c.dim(`(${elapsed}s...)`)}`;
    }, 1000);
  }

  /**
   * Stop the LLM waiting timer
   */
  private stopLlmWaitingTimer(): void {
    if (this.llmWaitingTimer) {
      clearInterval(this.llmWaitingTimer);
      this.llmWaitingTimer = null;
    }
  }

  /**
   * Display streaming reasoning/thinking content
   * Streams full LLM output to stderr in real-time
   */
  displayThinking(_moveNotation: string, thought: string): void {
    if (this.silent) return;

    // Stop the waiting timer - we're now receiving streaming content
    this.stopLlmWaitingTimer();

    // Pause spinner while streaming to prevent interference
    if (this.spinner) {
      this.spinner.stop();
    }

    // Stream the content directly to stderr
    process.stderr.write(thought);

    // Accumulate for tracking (still useful for buffer management)
    this.thinkingBuffer += thought;
  }

  /**
   * Called when streaming is complete for a move
   * Restarts the spinner if needed
   */
  endThinking(): void {
    // Add newline if buffer doesn't end with one
    if (this.thinkingBuffer && !this.thinkingBuffer.endsWith('\n')) {
      process.stderr.write('\n');
    }

    // Clear buffer
    this.thinkingBuffer = '';

    // Restart spinner
    if (this.spinner && !this.silent) {
      this.spinner.start();
    }
  }

  /**
   * Check if verbose mode is enabled
   */
  isVerbose(): boolean {
    return this.verbose;
  }

  /**
   * Check if debug mode is enabled
   */
  isDebug(): boolean {
    return this.debug;
  }

  /**
   * Display move context before annotation (debug mode only)
   * Delegates to DebugOutput
   */
  displayMoveContext(context: MoveContext): void {
    if (this.silent || !this.debug) return;
    this.debugOutput.displayMoveContext(context);
  }

  /**
   * Display full LLM reasoning content (debug mode only)
   * Delegates to DebugOutput
   */
  displayDebugThinking(thought: string, done: boolean = false): void {
    if (this.silent || !this.debug) return;
    this.debugOutput.displayThinking(thought, done);
  }

  /**
   * Display tool call details (debug mode only)
   * Delegates to DebugOutput
   */
  displayDebugToolCall(
    toolName: string,
    toolArgs: Record<string, unknown>,
    iteration: number,
    maxIterations: number,
  ): void {
    if (this.silent || !this.debug) return;
    this.debugOutput.displayToolCall(toolName, toolArgs, iteration, maxIterations);
  }

  /**
   * Display tool result details (debug mode only)
   * Delegates to DebugOutput
   */
  displayDebugToolResult(
    toolName: string,
    result: unknown,
    error: string | undefined,
    durationMs: number,
  ): void {
    if (this.silent || !this.debug) return;
    this.debugOutput.displayToolResult(toolName, result, error, durationMs);
  }

  /**
   * Display exploration tool call in chess-friendly format (debug mode only)
   * Delegates to ExplorationDisplay
   */
  displayExplorationToolCall(
    moveNotation: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
    iteration: number,
    maxIterations: number,
    context: ExplorationContext,
  ): void {
    if (this.silent || !this.debug) return;
    this.explorationDisplay.displayToolCall(
      moveNotation,
      toolName,
      toolArgs,
      iteration,
      maxIterations,
      context,
    );
  }

  /**
   * Display exploration tool result in chess-friendly format (debug mode only)
   * Delegates to ExplorationDisplay
   */
  displayExplorationToolResult(
    toolName: string,
    result: unknown,
    error: string | undefined,
    durationMs: number,
  ): void {
    if (this.silent || !this.debug) return;
    this.explorationDisplay.displayToolResult(toolName, result, error, durationMs);
  }

  /**
   * Display exploration completion summary (debug mode only)
   * Delegates to ExplorationDisplay
   */
  displayExplorationComplete(stats: {
    toolCalls: number;
    maxToolCalls: number;
    branchCount: number;
    totalAnnotations?: number;
  }): void {
    if (this.silent || !this.debug) return;
    this.explorationDisplay.displayComplete(stats);
  }

  /**
   * Display a position card in concise format (debug mode only)
   * Delegates to DebugOutput
   */
  displayPositionCard(cardText: string): void {
    if (this.silent || !this.debug) return;
    this.debugOutput.displayPositionCard(cardText);
  }

  /**
   * Complete a phase successfully
   */
  completePhase(phase: AnalysisPhase, detail?: string): void {
    if (this.silent) return;

    // Stop any running LLM waiting timer
    this.stopLlmWaitingTimer();

    const duration = Date.now() - this.phaseStartTime;
    const phaseName = PHASE_NAMES[phase];
    const durationStr = duration > 1000 ? this.c.dim(` (${(duration / 1000).toFixed(1)}s)`) : '';
    const detailStr = detail ? this.c.dim(`: ${detail}`) : '';

    if (this.spinner) {
      this.spinner.succeed(`${phaseName}${detailStr}${durationStr}`);
      this.spinner = null;
    } else {
      console.log(`  ${this.c.green('✓')} ${phaseName}${detailStr}${durationStr}`);
    }
  }

  /**
   * Fail a phase
   */
  failPhase(phase: AnalysisPhase, error: string): void {
    if (this.silent) return;

    // Stop any running LLM waiting timer
    this.stopLlmWaitingTimer();

    const phaseName = PHASE_NAMES[phase];

    if (this.spinner) {
      this.spinner.fail(`${phaseName}: ${error}`);
      this.spinner = null;
    } else {
      console.log(`  ${this.c.red('✗')} ${phaseName}: ${error}`);
    }
  }

  /**
   * Complete a game analysis
   */
  completeGame(_gameIndex: number, totalGames: number): void {
    if (this.silent) return;

    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }

    if (totalGames > 1) {
      console.log('');
    }
  }

  /**
   * Print the final summary
   */
  printSummary(stats: {
    gamesAnalyzed: number;
    criticalMoments: number;
    annotationsGenerated: number;
  }): void {
    if (this.silent) return;

    const totalTime = Date.now() - this.startTime;
    const timeStr =
      totalTime > 60000
        ? `${Math.floor(totalTime / 60000)}m ${Math.round((totalTime % 60000) / 1000)}s`
        : `${(totalTime / 1000).toFixed(1)}s`;

    console.log('');
    console.log(this.c.bold('Summary:'));
    console.log(`  Games analyzed: ${stats.gamesAnalyzed}`);
    console.log(`  Total time: ${timeStr}`);
    console.log(`  Critical moments: ${stats.criticalMoments}`);
    console.log(`  Annotations: ${stats.annotationsGenerated}`);
  }

  /**
   * Print LLM cost summary
   */
  printCostSummary(costs: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
    totalCost: number;
    toolCalls?: number;
    apiCalls?: number;
  }): void {
    if (this.silent) return;

    console.log('');
    console.log(this.c.bold('LLM Cost Summary:'));
    console.log(`  Model: ${costs.model}`);
    console.log(`  Input tokens: ${formatTokenCount(costs.inputTokens)}`);
    console.log(`  Output tokens: ${formatTokenCount(costs.outputTokens)}`);
    if (costs.reasoningTokens && costs.reasoningTokens > 0) {
      console.log(`  Reasoning tokens: ${formatTokenCount(costs.reasoningTokens)}`);
    }
    if (costs.apiCalls !== undefined) {
      console.log(`  API calls: ${costs.apiCalls}`);
    }
    if (costs.toolCalls !== undefined && costs.toolCalls > 0) {
      console.log(`  Tool calls: ${costs.toolCalls}`);
    }
    console.log(`  ${this.c.bold('Estimated cost:')} ${formatCost(costs.totalCost)}`);
  }

  /**
   * Display agentic tool call progress
   */
  displayToolCall(
    moveNotation: string,
    toolName: string,
    iteration: number,
    maxIterations: number,
  ): void {
    if (this.silent || !this.spinner) return;

    const iterStr = `[${iteration}/${maxIterations}]`;
    this.spinner.text = `${this.c.cyan(moveNotation)} ${iterStr} calling ${this.c.yellow(toolName)}...`;
  }

  /**
   * Print output file location
   */
  printOutputLocation(outputPath: string): void {
    if (this.silent) return;
    console.log('');
    console.log(`Output written to: ${this.c.cyan(outputPath)}`);
  }

  /**
   * Print a message (respects color and silent settings)
   */
  printMessage(message: string): void {
    if (this.silent) return;
    console.log(message);
  }

  /**
   * Print a success message
   */
  printSuccess(message: string): void {
    if (this.silent) return;
    console.log(this.c.green(`✓ ${message}`));
  }

  /**
   * Print a warning message
   */
  printWarning(message: string): void {
    if (this.silent) return;
    console.log(this.c.yellow(`⚠ ${message}`));
  }

  /**
   * Print a warning message safely while spinner is active.
   * Temporarily stops the spinner, prints the warning, then restarts it.
   * This prevents the warning from interleaving with spinner output.
   */
  warnSafe(message: string): void {
    if (this.silent) return;

    if (this.spinner) {
      // Spinner is active - stop it, print warning, restart
      const currentText = this.spinner.text;
      this.spinner.stop();
      console.log(this.c.yellow(`  ⚠ ${message}`));
      this.spinner.start(currentText);
    } else {
      // No spinner - just print the warning
      console.log(this.c.yellow(`  ⚠ ${message}`));
    }
  }

  /**
   * Print an error message
   */
  printError(message: string): void {
    if (this.silent) return;
    console.log(this.c.red(`✗ ${message}`));
  }

  /**
   * Stop any running spinner
   */
  stop(): void {
    // Stop any running LLM waiting timer
    this.stopLlmWaitingTimer();

    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  /**
   * Check if colors are enabled
   */
  hasColors(): boolean {
    return this.useColor;
  }
}

/**
 * Create a progress callback for the analysis pipeline
 */
export function createPipelineProgressCallback(
  reporter: ProgressReporter,
): (phase: string, current: number, total: number) => void {
  let currentPhase: string | null = null;

  return (phase: string, current: number, total: number) => {
    // Map pipeline phases to our phases
    const phaseMap: Record<string, AnalysisPhase> = {
      shallow_analysis: 'shallow_analysis',
      classification: 'classification',
      critical_detection: 'critical_detection',
      deep_analysis: 'deep_analysis',
      maia_analysis: 'maia_analysis',
      llm_annotation: 'llm_annotation',
      agentic_annotation: 'agentic_annotation',
      complete: 'complete',
    };

    const mappedPhase = phaseMap[phase];
    if (!mappedPhase) return;

    // Start new phase
    if (phase !== currentPhase) {
      if (currentPhase && phaseMap[currentPhase]) {
        reporter.completePhase(phaseMap[currentPhase]!);
      }
      currentPhase = phase;
      reporter.startPhase(mappedPhase);
    }

    // Update progress
    if (total > 0) {
      reporter.updateProgress(current, total);
    }

    // Complete if done
    if (phase === 'complete') {
      reporter.completePhase('complete');
      currentPhase = null;
    }
  };
}
