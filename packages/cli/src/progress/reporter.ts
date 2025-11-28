/**
 * Progress reporter with ora spinners
 */

import chalk from 'chalk';
import ora, { type Ora, type Color } from 'ora';

import { formatEta } from './formatters.js';
import { TimeEstimator } from './time-estimator.js';

/**
 * Analysis phases
 */
export type AnalysisPhase =
  | 'initializing'
  | 'parsing'
  | 'shallow_analysis'
  | 'classification'
  | 'critical_detection'
  | 'deep_analysis'
  | 'maia_analysis'
  | 'llm_annotation'
  | 'agentic_annotation'
  | 'rendering'
  | 'complete';

/**
 * Phase display names
 */
const PHASE_NAMES: Record<AnalysisPhase, string> = {
  initializing: 'Checking services',
  parsing: 'Parsing PGN',
  shallow_analysis: 'Shallow analysis',
  classification: 'Classification',
  critical_detection: 'Finding critical moments',
  deep_analysis: 'Deep analysis',
  maia_analysis: 'Maia analysis',
  llm_annotation: 'LLM annotation',
  agentic_annotation: 'Agentic annotation',
  rendering: 'Rendering output',
  complete: 'Complete',
};

/**
 * Service health status
 */
export interface ServiceStatus {
  name: string;
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Progress reporter options
 */
export interface ProgressReporterOptions {
  /** Suppress all output */
  silent?: boolean;
  /** Enable colored output (default: true) */
  color?: boolean;
  /** Enable verbose output including reasoning thoughts (default: false) */
  verbose?: boolean;
}

// Helper functions for colorized output
type ColorFn = (text: string) => string;

function createColorFns(useColor: boolean): {
  bold: ColorFn;
  dim: ColorFn;
  green: ColorFn;
  red: ColorFn;
  yellow: ColorFn;
  cyan: ColorFn;
} {
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
  private timeEstimator: TimeEstimator;
  private currentPhaseName: string = '';
  private thinkingBuffer: string = '';

  // LLM waiting timer - shows elapsed time while waiting for response
  private llmWaitingTimer: NodeJS.Timeout | null = null;
  private llmWaitingStartTime: number = 0;

  // Color functions
  private c: ReturnType<typeof createColorFns>;

  constructor(options: ProgressReporterOptions | boolean = {}) {
    // Handle legacy boolean argument for backwards compatibility
    if (typeof options === 'boolean') {
      this.silent = options;
      this.useColor = true;
      this.verbose = false;
    } else {
      this.silent = options.silent ?? false;
      this.useColor = options.color ?? true;
      this.verbose = options.verbose ?? false;
    }

    this.timeEstimator = new TimeEstimator();

    // Create color functions based on color setting
    this.c = createColorFns(this.useColor);
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
   * Shows real-time LLM activity during annotation
   */
  displayThinking(moveNotation: string, thought: string): void {
    if (this.silent || !this.spinner) return;

    // Stop the waiting timer - we're now receiving streaming content
    this.stopLlmWaitingTimer();

    // Accumulate thinking content
    this.thinkingBuffer += thought;

    // Get terminal width for truncation
    const terminalWidth = process.stdout.columns || 80;
    const maxWidth = Math.max(40, terminalWidth - 25);

    // Get the last line of thinking (most recent thought)
    const lines = this.thinkingBuffer.split('\n');
    const lastLine = lines[lines.length - 1] ?? '';

    // Truncate if needed
    const truncated =
      lastLine.length > maxWidth ? lastLine.slice(0, maxWidth - 3) + '...' : lastLine;

    // Clean up whitespace
    const cleaned = truncated.replace(/\s+/g, ' ').trim();

    if (cleaned) {
      // Update spinner with thinking content
      this.spinner.text = `${this.c.cyan(moveNotation)}: ${this.c.dim(cleaned)}`;
    }
  }

  /**
   * Check if verbose mode is enabled
   */
  isVerbose(): boolean {
    return this.verbose;
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
    console.log(`  Input tokens: ${this.formatTokenCount(costs.inputTokens)}`);
    console.log(`  Output tokens: ${this.formatTokenCount(costs.outputTokens)}`);
    if (costs.reasoningTokens && costs.reasoningTokens > 0) {
      console.log(`  Reasoning tokens: ${this.formatTokenCount(costs.reasoningTokens)}`);
    }
    if (costs.apiCalls !== undefined) {
      console.log(`  API calls: ${costs.apiCalls}`);
    }
    if (costs.toolCalls !== undefined && costs.toolCalls > 0) {
      console.log(`  Tool calls: ${costs.toolCalls}`);
    }
    console.log(`  ${this.c.bold('Estimated cost:')} ${this.formatCost(costs.totalCost)}`);
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
   * Format token count for display
   */
  private formatTokenCount(count: number): string {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(2)}M`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1)}K`;
    }
    return count.toLocaleString();
  }

  /**
   * Format cost in dollars
   */
  private formatCost(cost: number): string {
    if (cost < 0.0001) {
      return '< $0.0001';
    }
    return `$${cost.toFixed(4)}`;
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
