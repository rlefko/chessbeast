/**
 * CLI definition using Commander.js
 */

import { Command } from 'commander';

import type { CliOptions, AnalysisProfile, OutputVerbosity } from './config/schema.js';

export const VERSION = '0.1.0';

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
    .option('-p, --profile <profile>', 'Analysis profile: quick, standard, deep', 'standard')
    .option('-v, --verbosity <level>', 'Output verbosity: summary, normal, rich', 'normal')
    .option('--target-elo <rating>', 'Target audience rating for annotations', parseInt)
    .option('--skip-maia', 'Skip Maia human-likeness analysis')
    .option('--skip-llm', 'Skip LLM annotations (template only)')
    .option('--show-config', 'Print resolved configuration and exit')
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
  if (options['targetElo'] !== undefined) result.targetElo = options['targetElo'] as number;
  if (options['skipMaia'] !== undefined) result.skipMaia = options['skipMaia'] as boolean;
  if (options['skipLlm'] !== undefined) result.skipLlm = options['skipLlm'] as boolean;
  if (options['showConfig'] !== undefined) result.showConfig = options['showConfig'] as boolean;

  return result;
}
