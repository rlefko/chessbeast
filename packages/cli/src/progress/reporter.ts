/**
 * Progress reporter with ora spinners
 */

import chalk from 'chalk';
import ora, { type Ora } from 'ora';

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
 * Progress reporter for CLI output
 */
export class ProgressReporter {
  private spinner: Ora | null = null;
  private startTime: number = 0;
  private phaseStartTime: number = 0;
  private silent: boolean;

  constructor(silent: boolean = false) {
    this.silent = silent;
  }

  /**
   * Print the version header
   */
  printHeader(version: string): void {
    if (this.silent) return;
    console.log(chalk.bold(`ChessBeast v${version}`));
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

    console.log(chalk.dim('Checking services...'));
    for (const service of services) {
      const status = service.healthy ? chalk.green('✓') : chalk.red('✗');
      const latency = service.latencyMs !== undefined ? chalk.dim(` - ${service.latencyMs}ms`) : '';
      const error = service.error ? chalk.red(` (${service.error})`) : '';

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
    console.log(chalk.bold(`Analyzing ${gameLabel}: ${white} vs ${black} (${totalMoves} moves)`));
  }

  /**
   * Start a new analysis phase
   */
  startPhase(phase: AnalysisPhase): void {
    if (this.silent) return;

    this.phaseStartTime = Date.now();
    const phaseName = PHASE_NAMES[phase];

    // Stop any existing spinner
    if (this.spinner) {
      this.spinner.stop();
    }

    this.spinner = ora({
      text: phaseName,
      prefixText: '  ',
    }).start();
  }

  /**
   * Update phase progress
   */
  updateProgress(current: number, total: number): void {
    if (this.silent || !this.spinner) return;

    const phaseName = this.spinner.text.split('...')[0];
    this.spinner.text = `${phaseName}... ${current}/${total}`;
  }

  /**
   * Complete a phase successfully
   */
  completePhase(phase: AnalysisPhase, detail?: string): void {
    if (this.silent) return;

    const duration = Date.now() - this.phaseStartTime;
    const phaseName = PHASE_NAMES[phase];
    const durationStr = duration > 1000 ? chalk.dim(` (${(duration / 1000).toFixed(1)}s)`) : '';
    const detailStr = detail ? chalk.dim(`: ${detail}`) : '';

    if (this.spinner) {
      this.spinner.succeed(`${phaseName}${detailStr}${durationStr}`);
      this.spinner = null;
    } else {
      console.log(`  ${chalk.green('✓')} ${phaseName}${detailStr}${durationStr}`);
    }
  }

  /**
   * Fail a phase
   */
  failPhase(phase: AnalysisPhase, error: string): void {
    if (this.silent) return;

    const phaseName = PHASE_NAMES[phase];

    if (this.spinner) {
      this.spinner.fail(`${phaseName}: ${error}`);
      this.spinner = null;
    } else {
      console.log(`  ${chalk.red('✗')} ${phaseName}: ${error}`);
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
    console.log(chalk.bold('Summary:'));
    console.log(`  Games analyzed: ${stats.gamesAnalyzed}`);
    console.log(`  Total time: ${timeStr}`);
    console.log(`  Critical moments: ${stats.criticalMoments}`);
    console.log(`  Annotations: ${stats.annotationsGenerated}`);
  }

  /**
   * Print output file location
   */
  printOutputLocation(outputPath: string): void {
    if (this.silent) return;
    console.log('');
    console.log(`Output written to: ${chalk.cyan(outputPath)}`);
  }

  /**
   * Stop any running spinner
   */
  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
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
