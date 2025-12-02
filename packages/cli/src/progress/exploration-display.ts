/**
 * Exploration-specific display methods for debug mode
 * Extracted from ProgressReporter for SRP compliance
 */

import type { Ora } from 'ora';

import {
  formatEvaluation,
  formatMoveSequence,
  getNagMeaning,
  printAsciiBoard,
} from './eval-formatter.js';
import type { ColorFunctions } from './types.js';

/**
 * Context for exploration tool calls
 */
export interface ExplorationContext {
  currentFen?: string | undefined;
  currentLine?: string[] | undefined;
  depth?: number | undefined;
  branchPurpose?: string | undefined;
}

/**
 * Display class for exploration-specific output in debug mode
 */
export class ExplorationDisplay {
  constructor(
    private readonly c: ColorFunctions,
    private readonly getSpinner: () => Ora | null,
  ) {}

  /**
   * Display exploration tool call in chess-friendly format (debug mode only)
   * Shows tool name, arguments, and chess context for an experienced coach
   */
  displayToolCall(
    _moveNotation: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
    iteration: number,
    maxIterations: number,
    context: ExplorationContext,
  ): void {
    const spinner = this.getSpinner();

    // Stop spinner temporarily
    const spinnerText = spinner?.text;
    if (spinner) {
      spinner.stop();
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
          process.stderr.write(`  └─ Position: after ${formatMoveSequence(context.currentLine)}\n`);
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
            `  └─ Backtracking from: ${formatMoveSequence(context.currentLine)}\n`,
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
          process.stderr.write(`  └─ Branching from: ${formatMoveSequence(context.currentLine)}\n`);
        }
        // Show ASCII board at branch points
        if (context.currentFen) {
          process.stderr.write(`  └─ Board:\n`);
          printAsciiBoard(context.currentFen, '     ');
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
        const nagMeaning = getNagMeaning(nag);
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
    if (spinner && spinnerText) {
      spinner.start(spinnerText);
    }
  }

  /**
   * Display exploration tool result in chess-friendly format (debug mode only)
   * Shows evaluations, predictions, and move results for an experienced coach
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

    // Handle errors
    if (error) {
      process.stderr.write(`  ${this.c.red('✗ Error:')} ${error}\n\n`);
      if (spinner && spinnerText) {
        spinner.start(spinnerText);
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
          const evalStr = formatEvaluation(evalResult.evaluation, this.c);
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
              const altEval = formatEvaluation(alt.evaluation, this.c);
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
    if (spinner && spinnerText) {
      spinner.start(spinnerText);
    }
  }

  /**
   * Display exploration completion summary (debug mode only)
   */
  displayComplete(stats: {
    toolCalls: number;
    maxToolCalls: number;
    branchCount: number;
    totalAnnotations?: number;
  }): void {
    const spinner = this.getSpinner();

    // Stop spinner temporarily
    const spinnerText = spinner?.text;
    if (spinner) {
      spinner.stop();
    }

    process.stderr.write(`\n${this.c.green('[Exploration Complete]')}\n`);
    process.stderr.write(`  ├─ Variations: ${stats.branchCount} lines explored\n`);
    if (stats.totalAnnotations !== undefined) {
      process.stderr.write(`  ├─ Annotations: ${stats.totalAnnotations}\n`);
    }
    process.stderr.write(`  └─ Tool calls: ${stats.toolCalls}/${stats.maxToolCalls} used\n`);
    process.stderr.write('\n');

    // Restart spinner
    if (spinner && spinnerText) {
      spinner.start(spinnerText);
    }
  }
}
