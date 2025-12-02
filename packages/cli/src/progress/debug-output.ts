/**
 * Debug mode output methods
 * Extracted from ProgressReporter for SRP compliance
 */

import type { Ora } from 'ora';

import type { ColorFunctions } from './types.js';

/**
 * Move context for debug display
 */
export interface MoveContext {
  moveNotation: string;
  fen: string;
  evaluation: number;
  bestMove: string;
  classification?: string;
  cpLoss?: number;
}

/**
 * Debug output handler for detailed logging in debug mode
 */
export class DebugOutput {
  private debugThinkingBuffer: string = '';

  constructor(
    private readonly c: ColorFunctions,
    private readonly getSpinner: () => Ora | null,
  ) {}

  /**
   * Reset the thinking buffer (call when starting a new move)
   */
  resetBuffer(): void {
    this.debugThinkingBuffer = '';
  }

  /**
   * Display move context before annotation (debug mode only)
   * Shows FEN, evaluation, best move, and classification
   */
  displayMoveContext(context: MoveContext): void {
    // Reset debug thinking buffer for new move
    this.debugThinkingBuffer = '';

    const spinner = this.getSpinner();

    // Stop spinner temporarily
    const spinnerText = spinner?.text;
    if (spinner) {
      spinner.stop();
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
    if (spinner && spinnerText) {
      spinner.start(spinnerText);
    }
  }

  /**
   * Display full LLM reasoning content (debug mode only)
   * Accumulates streaming content and outputs when done
   */
  displayThinking(thought: string, done: boolean = false): void {
    // Accumulate thinking content
    this.debugThinkingBuffer += thought;

    // Only output when done (final chunk received)
    if (done && this.debugThinkingBuffer.trim()) {
      const spinner = this.getSpinner();

      // Stop spinner temporarily
      const spinnerText = spinner?.text;
      if (spinner) {
        spinner.stop();
      }

      // Print full reasoning to stderr
      process.stderr.write(`${this.c.dim('--- LLM Reasoning ---')}\n`);
      process.stderr.write(this.debugThinkingBuffer.trim() + '\n');
      process.stderr.write(`${this.c.dim('--- End Reasoning ---')}\n\n`);

      // Reset buffer
      this.debugThinkingBuffer = '';

      // Restart spinner
      if (spinner && spinnerText) {
        spinner.start(spinnerText);
      }
    }
  }

  /**
   * Display tool call details (debug mode only)
   * Shows tool name and full JSON arguments
   */
  displayToolCall(
    toolName: string,
    toolArgs: Record<string, unknown>,
    iteration: number,
    maxIterations: number,
  ): void {
    const spinner = this.getSpinner();

    // Stop spinner temporarily
    const spinnerText = spinner?.text;
    if (spinner) {
      spinner.stop();
    }

    // Print tool call to stderr
    process.stderr.write(
      `${this.c.yellow(`[Tool Call ${iteration}/${maxIterations}]`)} ${toolName}\n`,
    );
    process.stderr.write(`${this.c.dim('Arguments:')}\n`);
    process.stderr.write(JSON.stringify(toolArgs, null, 2) + '\n\n');

    // Restart spinner
    if (spinner && spinnerText) {
      spinner.start(spinnerText);
    }
  }

  /**
   * Display tool result details (debug mode only)
   * Shows result data or error with execution time
   */
  displayToolResult(
    toolName: string,
    result: unknown,
    error: string | undefined,
    durationMs: number,
  ): void {
    const spinner = this.getSpinner();

    // Stop spinner temporarily
    const spinnerText = spinner?.text;
    if (spinner) {
      spinner.stop();
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
    if (spinner && spinnerText) {
      spinner.start(spinnerText);
    }
  }
}
