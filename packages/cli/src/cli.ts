/**
 * CLI definition using Commander.js
 */

import { Command } from 'commander';

import type {
  CliOptions,
  AnalysisProfile,
  OutputVerbosity,
  AnnotationPerspective,
  ReasoningEffort,
  AnalysisSpeed,
  ThemeVerbosity,
  VariationDepth,
  CommentDensity,
  AudienceLevel,
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
 * Reasoning effort descriptions for help text
 */
const REASONING_EFFORT_HELP = `LLM reasoning effort (for gpt-5-codex, o1, o3):
    none   - Disable reasoning (standard completion)
    low    - Minimal reasoning for faster responses
    medium - Balanced reasoning for quality analysis [default]
    high   - Maximum reasoning for complex positions`;

/**
 * Analysis speed descriptions for help text
 */
const SPEED_HELP = `Analysis speed/tier:
    fast   - Quick analysis (shallow depth, minimal themes)
    normal - Balanced analysis [default]
    deep   - Thorough analysis (deep search, full themes)`;

/**
 * Theme verbosity descriptions for help text
 */
const THEMES_HELP = `Theme output verbosity:
    none      - No theme detection
    important - Only significant themes [default]
    all       - All detected themes`;

/**
 * Variation depth descriptions for help text
 */
const VARIATIONS_HELP = `Variation exploration depth:
    low    - Minimal variations
    medium - Standard exploration [default]
    high   - Deep variation trees`;

/**
 * Comment density descriptions for help text
 */
const DENSITY_HELP = `Comment density control:
    sparse  - Fewer comments, key moments only
    normal  - Standard density [default]
    verbose - More frequent comments`;

/**
 * Audience level descriptions for help text
 */
const AUDIENCE_HELP = `Target audience skill level:
    beginner - Simple explanations, basic terms
    club     - Club player level [default]
    expert   - Advanced terminology`;

/**
 * Ultra-Fast Coach mode descriptions for help text
 */
const ULTRA_FAST_COACH_HELP = `Enable Ultra-Fast Coach annotation mode.
    Uses engine-driven exploration with post-write LLM annotation
    for faster, more efficient analysis.`;

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
    .option('--model <model>', 'OpenAI model to use (e.g., gpt-5-codex, gpt-5-mini, gpt-5-nano)')
    .option('--token-budget <tokens>', 'Max tokens per game for LLM (default: 50000)', parseInt)
    .option('--skip-maia', 'Skip Maia human-likeness analysis')
    .option('--skip-llm', 'Skip LLM annotations (template only)')
    .option('--reasoning-effort <level>', REASONING_EFFORT_HELP, 'medium')
    .option('--verbose', 'Enable verbose output with real-time LLM reasoning display')
    .option(
      '--debug',
      'Enable detailed debug output with full LLM reasoning, move context, and tool call details',
    )
    .option('--show-config', 'Print resolved configuration and exit')
    .option('--no-color', 'Disable colored output (useful for piping)')
    .option('--dry-run', 'Validate setup and configuration without running analysis')
    .option('--speed <level>', SPEED_HELP, 'normal')
    .option('--themes <level>', THEMES_HELP, 'important')
    .option('--variations <level>', VARIATIONS_HELP, 'medium')
    .option('--comment-density <level>', DENSITY_HELP, 'normal')
    .option('--audience <level>', AUDIENCE_HELP, 'club')
    .option('--ultra-fast-coach', ULTRA_FAST_COACH_HELP)
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
  if (options['model'] !== undefined) result.model = options['model'] as string;
  if (options['skipMaia'] !== undefined) result.skipMaia = options['skipMaia'] as boolean;
  if (options['skipLlm'] !== undefined) result.skipLlm = options['skipLlm'] as boolean;
  if (options['showConfig'] !== undefined) result.showConfig = options['showConfig'] as boolean;
  // Note: Commander.js uses 'color' (negated) when --no-color is used
  if (options['color'] === false) result.noColor = true;
  if (options['dryRun'] !== undefined) result.dryRun = options['dryRun'] as boolean;
  if (options['reasoningEffort'] !== undefined)
    result.reasoningEffort = options['reasoningEffort'] as ReasoningEffort;
  if (options['verbose'] !== undefined) result.verbose = options['verbose'] as boolean;
  if (options['debug'] !== undefined) result.debug = options['debug'] as boolean;
  if (options['speed'] !== undefined) result.speed = options['speed'] as AnalysisSpeed;
  if (options['themes'] !== undefined) result.themes = options['themes'] as ThemeVerbosity;
  if (options['variations'] !== undefined)
    result.variations = options['variations'] as VariationDepth;
  if (options['commentDensity'] !== undefined)
    result.commentDensity = options['commentDensity'] as CommentDensity;
  if (options['audience'] !== undefined) result.audience = options['audience'] as AudienceLevel;
  if (options['ultraFastCoach'] !== undefined)
    result.ultraFastCoach = options['ultraFastCoach'] as boolean;

  return result;
}
