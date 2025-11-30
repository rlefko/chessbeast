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
  /** Enable detailed debug output with full LLM reasoning and tool call details (default: false) */
  debug?: boolean;
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
  private debug: boolean;
  private timeEstimator: TimeEstimator;
  private currentPhaseName: string = '';
  private thinkingBuffer: string = '';
  private debugThinkingBuffer: string = '';

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
   * Shows FEN, evaluation, best move, and classification
   */
  displayMoveContext(context: {
    moveNotation: string;
    fen: string;
    evaluation: number;
    bestMove: string;
    classification?: string;
    cpLoss?: number;
  }): void {
    if (this.silent || !this.debug) return;

    // Reset debug thinking buffer for new move
    this.debugThinkingBuffer = '';

    // Stop spinner temporarily
    const spinnerText = this.spinner?.text;
    if (this.spinner) {
      this.spinner.stop();
    }

    // Format evaluation
    const evalStr =
      Math.abs(context.evaluation) >= 10000
        ? context.evaluation > 0
          ? `M${Math.ceil((100000 - context.evaluation) / 100)}`
          : `M${Math.ceil((100000 + context.evaluation) / 100)}`
        : (context.evaluation / 100).toFixed(2);

    // Print to stderr for clean piping
    process.stderr.write(`\n${this.c.cyan(`=== DEBUG: ${context.moveNotation} ===`)}\n`);
    process.stderr.write(`FEN: ${context.fen}\n`);
    process.stderr.write(`Eval: ${evalStr} | Best: ${context.bestMove}\n`);
    if (context.classification) {
      const lossStr = context.cpLoss !== undefined ? ` (${context.cpLoss}cp loss)` : '';
      process.stderr.write(`Classification: ${context.classification}${lossStr}\n`);
    }
    process.stderr.write('\n');

    // Restart spinner
    if (this.spinner && spinnerText) {
      this.spinner.start(spinnerText);
    }
  }

  /**
   * Display full LLM reasoning content (debug mode only)
   * Accumulates streaming content and outputs when done
   */
  displayDebugThinking(thought: string, done: boolean = false): void {
    if (this.silent || !this.debug) return;

    // Accumulate thinking content
    this.debugThinkingBuffer += thought;

    // Only output when done (final chunk received)
    if (done && this.debugThinkingBuffer.trim()) {
      // Stop spinner temporarily
      const spinnerText = this.spinner?.text;
      if (this.spinner) {
        this.spinner.stop();
      }

      // Print full reasoning to stderr
      process.stderr.write(`${this.c.dim('--- LLM Reasoning ---')}\n`);
      process.stderr.write(this.debugThinkingBuffer.trim() + '\n');
      process.stderr.write(`${this.c.dim('--- End Reasoning ---')}\n\n`);

      // Reset buffer
      this.debugThinkingBuffer = '';

      // Restart spinner
      if (this.spinner && spinnerText) {
        this.spinner.start(spinnerText);
      }
    }
  }

  /**
   * Display tool call details (debug mode only)
   * Shows tool name and full JSON arguments
   */
  displayDebugToolCall(
    toolName: string,
    toolArgs: Record<string, unknown>,
    iteration: number,
    maxIterations: number,
  ): void {
    if (this.silent || !this.debug) return;

    // Stop spinner temporarily
    const spinnerText = this.spinner?.text;
    if (this.spinner) {
      this.spinner.stop();
    }

    // Print tool call to stderr
    process.stderr.write(
      `${this.c.yellow(`[Tool Call ${iteration}/${maxIterations}]`)} ${toolName}\n`,
    );
    process.stderr.write(`${this.c.dim('Arguments:')}\n`);
    process.stderr.write(JSON.stringify(toolArgs, null, 2) + '\n\n');

    // Restart spinner
    if (this.spinner && spinnerText) {
      this.spinner.start(spinnerText);
    }
  }

  /**
   * Display tool result details (debug mode only)
   * Shows result data or error with execution time
   */
  displayDebugToolResult(
    toolName: string,
    result: unknown,
    error: string | undefined,
    durationMs: number,
  ): void {
    if (this.silent || !this.debug) return;

    // Stop spinner temporarily
    const spinnerText = this.spinner?.text;
    if (this.spinner) {
      this.spinner.stop();
    }

    // Print tool result to stderr
    const statusColor = error ? this.c.red : this.c.green;
    const statusText = error ? 'ERROR' : 'Result';
    process.stderr.write(`${statusColor(`[Tool ${statusText}]`)} ${toolName} (${durationMs}ms)\n`);

    if (error) {
      process.stderr.write(`${this.c.red(error)}\n\n`);
    } else {
      process.stderr.write(JSON.stringify(result, null, 2) + '\n\n');
    }

    // Restart spinner
    if (this.spinner && spinnerText) {
      this.spinner.start(spinnerText);
    }
  }

  /**
   * Display exploration tool call in chess-friendly format (debug mode only)
   * Shows tool name, arguments, and chess context for an experienced coach
   */
  displayExplorationToolCall(
    _moveNotation: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
    iteration: number,
    maxIterations: number,
    context: {
      currentFen?: string | undefined;
      currentLine?: string[] | undefined;
      depth?: number | undefined;
      branchPurpose?: string | undefined;
    },
  ): void {
    if (this.silent || !this.debug) return;

    // Stop spinner temporarily
    const spinnerText = this.spinner?.text;
    if (this.spinner) {
      this.spinner.stop();
    }

    // Format based on tool type for coach-friendly output
    const iterStr = `[Tool ${iteration}/${maxIterations}]`;

    switch (toolName) {
      case 'evaluate_position': {
        const depth = (toolArgs.depth as number) ?? 16;
        const multipv = (toolArgs.multipv as number) ?? 1;
        const multipvStr = multipv > 1 ? `, multipv ${multipv}` : '';
        process.stderr.write(
          `${this.c.yellow(iterStr)} evaluate_position (depth ${depth}${multipvStr})\n`,
        );
        if (context.currentLine && context.currentLine.length > 0) {
          process.stderr.write(
            `  └─ Position: after ${this.formatMoveSequence(context.currentLine)}\n`,
          );
        }
        break;
      }

      case 'predict_human_moves': {
        const rating = (toolArgs.rating as number) ?? 1500;
        process.stderr.write(`${this.c.yellow(iterStr)} predict_human_moves (rating ${rating})\n`);
        break;
      }

      case 'push_move': {
        const move = (toolArgs.move ?? 'unknown') as string;
        process.stderr.write(`${this.c.yellow(iterStr)} push_move: ${this.c.cyan(move)}\n`);
        break;
      }

      case 'pop_move': {
        process.stderr.write(`${this.c.yellow(iterStr)} pop_move\n`);
        if (context.currentLine && context.currentLine.length > 0) {
          process.stderr.write(
            `  └─ Backtracking from: ${this.formatMoveSequence(context.currentLine)}\n`,
          );
        }
        break;
      }

      case 'start_branch': {
        const purpose = toolArgs.purpose as string;
        const branchNum = (context.depth ?? 0) + 1;
        process.stderr.write(`\n${this.c.cyan(`[Branch ${branchNum}]`)} Starting sub-variation\n`);
        process.stderr.write(`  └─ Purpose: ${purpose}\n`);
        if (context.currentLine && context.currentLine.length > 0) {
          process.stderr.write(
            `  └─ Branching from: ${this.formatMoveSequence(context.currentLine)}\n`,
          );
        }
        // Show ASCII board at branch points
        if (context.currentFen) {
          process.stderr.write(`  └─ Board:\n`);
          this.printAsciiBoard(context.currentFen, '     ');
        }
        break;
      }

      case 'end_branch': {
        process.stderr.write(`${this.c.dim(iterStr)} end_branch\n`);
        process.stderr.write(`  └─ Returning to main line\n`);
        break;
      }

      case 'add_comment': {
        const comment = toolArgs.comment as string;
        const truncated = comment.length > 60 ? comment.slice(0, 60) + '...' : comment;
        process.stderr.write(`${this.c.dim(iterStr)} add_comment\n`);
        process.stderr.write(`  └─ "${truncated}"\n`);
        break;
      }

      case 'add_nag': {
        const nag = toolArgs.nag as string;
        const nagMeaning = this.getNagMeaning(nag);
        process.stderr.write(
          `${this.c.dim(iterStr)} add_nag ${nag}${nagMeaning ? ` (${nagMeaning})` : ''}\n`,
        );
        break;
      }

      case 'finish_exploration': {
        process.stderr.write(`\n${this.c.green(iterStr)} finish_exploration\n`);
        break;
      }

      default: {
        // Generic fallback
        process.stderr.write(`${this.c.yellow(iterStr)} ${toolName}\n`);
        process.stderr.write(`  ${this.c.dim('Args:')} ${JSON.stringify(toolArgs)}\n`);
      }
    }

    process.stderr.write('\n');

    // Restart spinner
    if (this.spinner && spinnerText) {
      this.spinner.start(spinnerText);
    }
  }

  /**
   * Display exploration tool result in chess-friendly format (debug mode only)
   * Shows evaluations, predictions, and move results for an experienced coach
   */
  displayExplorationToolResult(
    toolName: string,
    result: unknown,
    error: string | undefined,
    durationMs: number,
  ): void {
    if (this.silent || !this.debug) return;

    // Stop spinner temporarily
    const spinnerText = this.spinner?.text;
    if (this.spinner) {
      this.spinner.stop();
    }

    // Handle errors
    if (error) {
      process.stderr.write(`  ${this.c.red('✗ Error:')} ${error}\n\n`);
      if (this.spinner && spinnerText) {
        this.spinner.start(spinnerText);
      }
      return;
    }

    // Format based on tool type
    switch (toolName) {
      case 'evaluate_position': {
        const evalResult = result as {
          evaluation?: { cp?: number; mate?: number };
          bestMove?: string;
          pv?: string[];
          alternatives?: Array<{
            move: string;
            evaluation: { cp?: number; mate?: number };
            pv?: string[];
          }>;
        };

        if (evalResult.evaluation) {
          const evalStr = this.formatEvaluation(evalResult.evaluation);
          process.stderr.write(`  └─ Result: ${evalStr}\n`);

          // Show best line (full PV)
          if (evalResult.pv && evalResult.pv.length > 0) {
            process.stderr.write(`     Best line: ${evalResult.pv.join(' ')}\n`);
          } else if (evalResult.bestMove) {
            process.stderr.write(`     Best: ${evalResult.bestMove}\n`);
          }

          // Show alternatives
          if (evalResult.alternatives && evalResult.alternatives.length > 0) {
            for (const alt of evalResult.alternatives) {
              const altEval = this.formatEvaluation(alt.evaluation);
              const altPv =
                alt.pv && alt.pv.length > 0 ? ` ${alt.pv.slice(0, 5).join(' ')}...` : '';
              process.stderr.write(`     Alt:  ${alt.move} ${altEval}${altPv}\n`);
            }
          }
        }
        break;
      }

      case 'predict_human_moves': {
        const predictions = result as Array<{
          move: string;
          probability: number;
          comment?: string;
        }>;
        if (Array.isArray(predictions) && predictions.length > 0) {
          process.stderr.write(`  └─ Human predictions:\n`);
          for (let i = 0; i < Math.min(predictions.length, 5); i++) {
            const pred = predictions[i]!;
            const pct = (pred.probability * 100).toFixed(0);
            const comment = pred.comment ? ` - ${pred.comment}` : '';
            process.stderr.write(`     ${i + 1}. ${pred.move} (${pct}%)${comment}\n`);
          }
        }
        break;
      }

      case 'push_move': {
        const moveResult = result as {
          success?: boolean;
          check?: boolean;
          capture?: boolean;
          fen?: string;
        };
        if (moveResult.success !== false) {
          let details = '✓';
          if (moveResult.check) details += ' Check';
          if (moveResult.capture) details += ' Capture';
          process.stderr.write(`  └─ ${this.c.green(details)}\n`);
        }
        break;
      }

      case 'pop_move': {
        process.stderr.write(`  └─ ${this.c.dim('Reverted')}\n`);
        break;
      }

      // Branch operations don't need result display
      case 'start_branch':
      case 'end_branch':
      case 'add_comment':
      case 'add_nag':
      case 'finish_exploration':
        break;

      default: {
        // Generic result display
        if (result !== undefined && result !== null) {
          const resultStr = JSON.stringify(result);
          if (resultStr.length > 100) {
            process.stderr.write(`  └─ ${resultStr.slice(0, 100)}...\n`);
          } else {
            process.stderr.write(`  └─ ${resultStr}\n`);
          }
        }
      }
    }

    // Show timing for slow operations
    if (durationMs > 100) {
      process.stderr.write(`  ${this.c.dim(`(${durationMs}ms)`)}\n`);
    }

    // Restart spinner
    if (this.spinner && spinnerText) {
      this.spinner.start(spinnerText);
    }
  }

  /**
   * Display exploration completion summary (debug mode only)
   */
  displayExplorationComplete(stats: {
    toolCalls: number;
    maxToolCalls: number;
    branchCount: number;
    totalAnnotations?: number;
  }): void {
    if (this.silent || !this.debug) return;

    // Stop spinner temporarily
    const spinnerText = this.spinner?.text;
    if (this.spinner) {
      this.spinner.stop();
    }

    process.stderr.write(`\n${this.c.green('[Exploration Complete]')}\n`);
    process.stderr.write(`  ├─ Variations: ${stats.branchCount} lines explored\n`);
    if (stats.totalAnnotations !== undefined) {
      process.stderr.write(`  ├─ Annotations: ${stats.totalAnnotations}\n`);
    }
    process.stderr.write(`  └─ Tool calls: ${stats.toolCalls}/${stats.maxToolCalls} used\n`);
    process.stderr.write('\n');

    // Restart spinner
    if (this.spinner && spinnerText) {
      this.spinner.start(spinnerText);
    }
  }

  /**
   * Format evaluation in chess-friendly format: centipawns + verbal
   * e.g., "+4.28 (White winning)" or "M5 (White mates in 5)"
   */
  private formatEvaluation(evaluation: { cp?: number; mate?: number }): string {
    if (evaluation.mate !== undefined) {
      const side = evaluation.mate > 0 ? 'White' : 'Black';
      const moves = Math.abs(evaluation.mate);
      return this.c.bold(`M${moves}`) + ` (${side} mates in ${moves})`;
    }

    if (evaluation.cp !== undefined) {
      const cp = evaluation.cp;
      const pawns = (cp / 100).toFixed(2);
      const sign = cp >= 0 ? '+' : '';
      const verbal = this.getEvalVerbal(cp);
      return `${sign}${pawns} ${this.c.dim(`(${verbal})`)}`;
    }

    return 'unknown';
  }

  /**
   * Get verbal description of evaluation
   */
  private getEvalVerbal(cp: number): string {
    const absCp = Math.abs(cp);
    const side = cp >= 0 ? 'White' : 'Black';

    if (absCp < 25) return 'Equal';
    if (absCp < 75) return `Slight edge ${side}`;
    if (absCp < 150) return `${side} better`;
    if (absCp < 300) return `${side} much better`;
    if (absCp < 500) return `${side} winning`;
    return `${side} winning decisively`;
  }

  /**
   * Format a sequence of moves for display
   * e.g., ["Nxg7", "Kxg7"] -> "1... Nxg7 2. Kxg7"
   */
  private formatMoveSequence(moves: string[]): string {
    if (moves.length === 0) return '';
    // Just join them - the move sequence should already include notation
    return moves.slice(-4).join(' '); // Show last 4 moves to keep it readable
  }

  /**
   * Get human-readable NAG meaning
   */
  private getNagMeaning(nag: string): string {
    const meanings: Record<string, string> = {
      $1: '!',
      $2: '?',
      $3: '!!',
      $4: '??',
      $5: '!?',
      $6: '?!',
      $10: '=',
      $13: 'unclear',
      $14: '+=',
      $15: '=+',
      $16: '±',
      $17: '∓',
      $18: '+-',
      $19: '-+',
    };
    return meanings[nag] ?? '';
  }

  /**
   * Print ASCII board representation
   */
  private printAsciiBoard(fen: string, indent: string = ''): void {
    const pieces: Record<string, string> = {
      K: 'K',
      Q: 'Q',
      R: 'R',
      B: 'B',
      N: 'N',
      P: 'P',
      k: 'k',
      q: 'q',
      r: 'r',
      b: 'b',
      n: 'n',
      p: 'p',
    };

    const boardPart = fen.split(' ')[0];
    if (!boardPart) return;

    const rows = boardPart.split('/');
    for (const row of rows) {
      let line = '';
      for (const char of row) {
        if (char >= '1' && char <= '8') {
          line += '. '.repeat(parseInt(char, 10));
        } else {
          line += (pieces[char] ?? '?') + ' ';
        }
      }
      process.stderr.write(`${indent}${line.trim()}\n`);
    }
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
