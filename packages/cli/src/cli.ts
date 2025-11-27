/**
 * CLI definition using Commander.js
 */

import { Command } from 'commander';

import type {
  CliOptions,
  AnalysisProfile,
  OutputVerbosity,
  AnnotationPerspective,
} from './config/schema.js';

export const VERSION = '0.1.0';

/**
 * Profile descriptions for help text
 */
const PROFILE_HELP = `Analysis profile:
    quick    - Fast analysis (depth 12/16, ~15% critical moments)
    standard - Balanced analysis (depth 14/22, ~25% critical) [default]
    deep     - Thorough analysis (depth 18/28, ~35% critical)`;

/**
 * Verbosity descriptions for help text
 */
const VERBOSITY_HELP = `Output verbosity:
    summary - Brief move comments, no variations
    normal  - Standard annotations with key lines [default]
    rich    - Detailed explanations with alternatives`;

/**
 * Perspective descriptions for help text
 */
const PERSPECTIVE_HELP = `Annotation perspective:
    neutral - Objective commentary (White/Black) [default]
    white   - From White's point of view (we/they)
    black   - From Black's point of view (we/they)`;

/**
 * Create and configure the CLI program
 */
export function createProgram(): Command {
  const program = new Command()
    .name('chessbeast')
    .description(
      'AI Chess Annotator - Analyze and annotate PGN games with engine analysis and LLM commentary',
    )
    .version(VERSION);

  // Analyze command
  program
    .command('analyze')
    .description('Analyze and annotate a PGN game file')
    .option('-i, --input <file>', 'Input PGN file (default: stdin)')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .option('-c, --config <file>', 'Path to config file')
    .option('-p, --profile <profile>', PROFILE_HELP, 'standard')
    .option('-v, --verbosity <level>', VERBOSITY_HELP, 'normal')
    .option('--perspective <side>', PERSPECTIVE_HELP, 'neutral')
    .option('--target-elo <rating>', 'Target audience rating for annotations', parseInt)
    .option('--token-budget <tokens>', 'Max tokens per game for LLM (default: 50000)', parseInt)
    .option('--skip-maia', 'Skip Maia human-likeness analysis')
    .option('--skip-llm', 'Skip LLM annotations (template only)')
    .option('--show-config', 'Print resolved configuration and exit')
    .option('--no-color', 'Disable colored output (useful for piping)')
    .option('--dry-run', 'Validate setup and configuration without running analysis')
    .action(async (options) => {
      // Import dynamically to avoid circular dependencies
      const { analyzeCommand } = await import('./commands/analyze.js');
      await analyzeCommand(options);
    });

  return program;
}

/**
 * Parse CLI options from command options object
 */
export function parseCliOptions(options: Record<string, unknown>): CliOptions {
  const result: CliOptions = {};

  if (options['input'] !== undefined) result.input = options['input'] as string;
  if (options['output'] !== undefined) result.output = options['output'] as string;
  if (options['config'] !== undefined) result.config = options['config'] as string;
  if (options['profile'] !== undefined) result.profile = options['profile'] as AnalysisProfile;
  if (options['verbosity'] !== undefined)
    result.verbosity = options['verbosity'] as OutputVerbosity;
  if (options['perspective'] !== undefined)
    result.perspective = options['perspective'] as AnnotationPerspective;
  if (options['targetElo'] !== undefined) result.targetElo = options['targetElo'] as number;
  if (options['tokenBudget'] !== undefined) result.tokenBudget = options['tokenBudget'] as number;
  if (options['skipMaia'] !== undefined) result.skipMaia = options['skipMaia'] as boolean;
  if (options['skipLlm'] !== undefined) result.skipLlm = options['skipLlm'] as boolean;
  if (options['showConfig'] !== undefined) result.showConfig = options['showConfig'] as boolean;
  // Note: Commander.js uses 'color' (negated) when --no-color is used
  if (options['color'] === false) result.noColor = true;
  if (options['dryRun'] !== undefined) result.dryRun = options['dryRun'] as boolean;

  return result;
}
