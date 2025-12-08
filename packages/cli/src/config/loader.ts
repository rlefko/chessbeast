/**
 * Configuration loading from files, environment variables, and CLI arguments
 */

import { cosmiconfig } from 'cosmiconfig';

import { DEFAULT_CONFIG, applyProfile, ANALYSIS_PROFILES } from './defaults.js';
import type {
  ChessBeastConfig,
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
} from './schema.js';
import { validateConfig, validatePartialConfig } from './validation.js';

/**
 * Environment variable mapping
 * Maps env var names to config paths
 */
const ENV_VAR_MAP: Record<string, string> = {
  // API Keys
  OPENAI_API_KEY: 'llm.apiKey',

  // Analysis
  CHESSBEAST_PROFILE: 'analysis.profile',
  CHESSBEAST_SKIP_MAIA: 'analysis.skipMaia',
  CHESSBEAST_SKIP_LLM: 'analysis.skipLlm',

  // Ratings
  CHESSBEAST_DEFAULT_RATING: 'ratings.defaultRating',
  CHESSBEAST_TARGET_RATING: 'ratings.targetAudienceRating',

  // LLM
  CHESSBEAST_LLM_MODEL: 'llm.model',
  CHESSBEAST_LLM_TIMEOUT: 'llm.timeout',
  CHESSBEAST_TOKEN_BUDGET: 'llm.tokenBudget',
  LLM_REASONING_EFFORT: 'llm.reasoningEffort',
  LLM_STREAMING: 'llm.streaming',

  // Agentic
  CHESSBEAST_AGENTIC: 'agentic.enabled',
  CHESSBEAST_AGENTIC_ALL: 'agentic.annotateAll',
  CHESSBEAST_MAX_TOOL_CALLS: 'agentic.maxToolCalls',
  CHESSBEAST_SHOW_COSTS: 'agentic.showCosts',

  // Services
  CHESSBEAST_STOCKFISH_HOST: 'services.stockfish.host',
  CHESSBEAST_STOCKFISH_PORT: 'services.stockfish.port',
  CHESSBEAST_MAIA_HOST: 'services.maia.host',
  CHESSBEAST_MAIA_PORT: 'services.maia.port',

  // Databases
  CHESSBEAST_ECO_DB: 'databases.ecoPath',
  CHESSBEAST_LICHESS_DB: 'databases.lichessPath',

  // Output
  CHESSBEAST_VERBOSITY: 'output.verbosity',
  CHESSBEAST_PERSPECTIVE: 'output.perspective',

  // Ultra-Fast Coach
  CHESSBEAST_SPEED: 'ultraFastCoach.speed',
  CHESSBEAST_THEMES: 'ultraFastCoach.themes',
  CHESSBEAST_VARIATIONS: 'ultraFastCoach.variations',
  CHESSBEAST_COMMENT_DENSITY: 'ultraFastCoach.commentDensity',
  CHESSBEAST_AUDIENCE: 'ultraFastCoach.audience',
};

/**
 * Deep clone an object
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Deep merge two objects
 * Source values override target values
 */
function deepMerge(target: ChessBeastConfig, source: Partial<ChessBeastConfig>): ChessBeastConfig {
  const result = deepClone(target);

  // Merge analysis
  if (source.analysis) {
    result.analysis = { ...result.analysis, ...source.analysis };
  }

  // Merge ratings
  if (source.ratings) {
    result.ratings = { ...result.ratings, ...source.ratings };
  }

  // Merge llm
  if (source.llm) {
    result.llm = { ...result.llm, ...source.llm };
  }

  // Merge agentic
  if (source.agentic) {
    result.agentic = { ...result.agentic, ...source.agentic };
  }

  // Merge services
  if (source.services) {
    if (source.services.stockfish) {
      result.services.stockfish = { ...result.services.stockfish, ...source.services.stockfish };
    }
    if (source.services.maia) {
      result.services.maia = { ...result.services.maia, ...source.services.maia };
    }
  }

  // Merge databases
  if (source.databases) {
    result.databases = { ...result.databases, ...source.databases };
  }

  // Merge output
  if (source.output) {
    result.output = { ...result.output, ...source.output };
  }

  // Merge ultraFastCoach
  if (source.ultraFastCoach) {
    result.ultraFastCoach = { ...result.ultraFastCoach, ...source.ultraFastCoach };
  }

  return result;
}

/**
 * Set a nested property on an object using dot notation path
 */
function setNestedProperty(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;
  current[lastPart] = value;
}

/**
 * Parse environment variable value based on expected type
 */
function parseEnvValue(value: string, path: string): unknown {
  // Boolean values
  if (
    path.includes('skip') ||
    path.includes('include') ||
    path.includes('enabled') ||
    path.includes('annotateAll') ||
    path.includes('showCosts')
  ) {
    return value.toLowerCase() === 'true' || value === '1';
  }

  // Numeric values
  if (
    path.includes('port') ||
    path.includes('timeout') ||
    path.includes('Timeout') ||
    path.includes('Rating') ||
    path.includes('Depth') ||
    path.includes('Count') ||
    path.includes('Ratio') ||
    path.includes('maxToolCalls')
  ) {
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  }

  return value;
}

/**
 * Load configuration from environment variables
 */
function loadEnvConfig(): Partial<ChessBeastConfig> {
  const config: Record<string, unknown> = {};

  for (const [envVar, configPath] of Object.entries(ENV_VAR_MAP)) {
    const value = process.env[envVar];
    if (value !== undefined && value !== '') {
      const parsedValue = parseEnvValue(value, configPath);
      setNestedProperty(config, configPath, parsedValue);
    }
  }

  return config as Partial<ChessBeastConfig>;
}

/**
 * Load configuration from config file using cosmiconfig
 */
async function loadConfigFile(configPath?: string): Promise<Partial<ChessBeastConfig> | null> {
  const explorer = cosmiconfig('chessbeast', {
    searchPlaces: [
      'package.json',
      '.chessbeastrc',
      '.chessbeastrc.json',
      '.chessbeastrc.yaml',
      '.chessbeastrc.yml',
      '.chessbeastrc.js',
      '.chessbeastrc.cjs',
      'chessbeast.config.js',
      'chessbeast.config.cjs',
    ],
  });

  try {
    const result = configPath ? await explorer.load(configPath) : await explorer.search();

    if (result && result.config) {
      // Validate partial config
      validatePartialConfig(result.config);
      return result.config as Partial<ChessBeastConfig>;
    }
  } catch (error) {
    if (configPath) {
      // If explicit config path was provided, re-throw the error
      throw error;
    }
    // Otherwise, silently ignore missing config file
  }

  return null;
}

/**
 * Map CLI options to config object
 */
function mapCliToConfig(options: CliOptions): Partial<ChessBeastConfig> {
  const config: Partial<ChessBeastConfig> = {};

  if (options.profile !== undefined) {
    config.analysis = {
      ...config.analysis,
      profile: options.profile,
    } as ChessBeastConfig['analysis'];
  }

  if (options.skipMaia !== undefined) {
    config.analysis = {
      ...config.analysis,
      skipMaia: options.skipMaia,
    } as ChessBeastConfig['analysis'];
  }

  if (options.skipLlm !== undefined) {
    config.analysis = {
      ...config.analysis,
      skipLlm: options.skipLlm,
    } as ChessBeastConfig['analysis'];
  }

  if (options.verbosity !== undefined) {
    const verbosityMap: Record<OutputVerbosity, OutputVerbosity> = {
      summary: 'summary',
      normal: 'normal',
      rich: 'rich',
    };
    config.output = {
      ...config.output,
      verbosity: verbosityMap[options.verbosity],
    } as ChessBeastConfig['output'];
  }

  if (options.perspective !== undefined) {
    const perspectiveMap: Record<AnnotationPerspective, AnnotationPerspective> = {
      white: 'white',
      black: 'black',
      neutral: 'neutral',
    };
    config.output = {
      ...config.output,
      perspective: perspectiveMap[options.perspective],
    } as ChessBeastConfig['output'];
  }

  if (options.targetElo !== undefined) {
    config.ratings = {
      ...config.ratings,
      targetAudienceRating: options.targetElo,
    } as ChessBeastConfig['ratings'];
  }

  if (options.tokenBudget !== undefined) {
    config.llm = {
      ...config.llm,
      tokenBudget: options.tokenBudget,
    } as ChessBeastConfig['llm'];
  }

  if (options.model !== undefined) {
    config.llm = {
      ...config.llm,
      model: options.model,
    } as ChessBeastConfig['llm'];
  }

  if (options.reasoningEffort !== undefined) {
    const effortMap: Record<ReasoningEffort, ReasoningEffort> = {
      none: 'none',
      low: 'low',
      medium: 'medium',
      high: 'high',
    };
    config.llm = {
      ...config.llm,
      reasoningEffort: effortMap[options.reasoningEffort],
    } as ChessBeastConfig['llm'];
  }

  // Agentic options
  if (options.agentic !== undefined) {
    config.agentic = {
      ...config.agentic,
      enabled: options.agentic,
    } as ChessBeastConfig['agentic'];
  }

  if (options.agenticAll !== undefined) {
    config.agentic = {
      ...config.agentic,
      annotateAll: options.agenticAll,
      // If --agentic-all is set, implicitly enable agentic mode
      enabled: options.agenticAll ? true : config.agentic?.enabled,
    } as ChessBeastConfig['agentic'];
  }

  if (options.maxToolCalls !== undefined) {
    config.agentic = {
      ...config.agentic,
      maxToolCalls: options.maxToolCalls,
    } as ChessBeastConfig['agentic'];
  }

  if (options.showCosts !== undefined) {
    config.agentic = {
      ...config.agentic,
      showCosts: options.showCosts,
    } as ChessBeastConfig['agentic'];
  }

  // Agentic exploration options
  if (options.agenticExploration !== undefined) {
    config.agentic = {
      ...config.agentic,
      agenticExploration: options.agenticExploration,
    } as ChessBeastConfig['agentic'];
  }

  if (options.explorationMaxToolCalls !== undefined) {
    config.agentic = {
      ...config.agentic,
      explorationMaxToolCalls: options.explorationMaxToolCalls,
    } as ChessBeastConfig['agentic'];
  }

  if (options.explorationMaxDepth !== undefined) {
    config.agentic = {
      ...config.agentic,
      explorationMaxDepth: options.explorationMaxDepth,
    } as ChessBeastConfig['agentic'];
  }

  // Ultra-Fast Coach options
  if (options.speed !== undefined) {
    const speedMap: Record<AnalysisSpeed, AnalysisSpeed> = {
      fast: 'fast',
      normal: 'normal',
      deep: 'deep',
    };
    config.ultraFastCoach = {
      ...config.ultraFastCoach,
      speed: speedMap[options.speed],
    } as ChessBeastConfig['ultraFastCoach'];
  }

  if (options.themes !== undefined) {
    const themesMap: Record<ThemeVerbosity, ThemeVerbosity> = {
      none: 'none',
      important: 'important',
      all: 'all',
    };
    config.ultraFastCoach = {
      ...config.ultraFastCoach,
      themes: themesMap[options.themes],
    } as ChessBeastConfig['ultraFastCoach'];
  }

  if (options.variations !== undefined) {
    const variationsMap: Record<VariationDepth, VariationDepth> = {
      low: 'low',
      medium: 'medium',
      high: 'high',
    };
    config.ultraFastCoach = {
      ...config.ultraFastCoach,
      variations: variationsMap[options.variations],
    } as ChessBeastConfig['ultraFastCoach'];
  }

  if (options.commentDensity !== undefined) {
    const densityMap: Record<CommentDensity, CommentDensity> = {
      sparse: 'sparse',
      normal: 'normal',
      verbose: 'verbose',
    };
    config.ultraFastCoach = {
      ...config.ultraFastCoach,
      commentDensity: densityMap[options.commentDensity],
    } as ChessBeastConfig['ultraFastCoach'];
  }

  if (options.audience !== undefined) {
    const audienceMap: Record<AudienceLevel, AudienceLevel> = {
      beginner: 'beginner',
      club: 'club',
      expert: 'expert',
    };
    config.ultraFastCoach = {
      ...config.ultraFastCoach,
      audience: audienceMap[options.audience],
    } as ChessBeastConfig['ultraFastCoach'];
  }

  return config;
}

/**
 * Load and merge configuration from all sources
 *
 * Precedence (highest to lowest):
 * 1. CLI arguments
 * 2. Environment variables
 * 3. Config file
 * 4. Default values
 */
export async function loadConfig(cliOptions: CliOptions): Promise<ChessBeastConfig> {
  // 1. Start with defaults
  let config = deepClone(DEFAULT_CONFIG);

  // 2. Load and merge config file (if exists)
  const fileConfig = await loadConfigFile(cliOptions.config);
  if (fileConfig) {
    config = deepMerge(config, fileConfig);
  }

  // 3. Apply environment variables
  const envConfig = loadEnvConfig();
  config = deepMerge(config, envConfig);

  // 4. Apply CLI arguments (highest priority)
  const cliConfig = mapCliToConfig(cliOptions);
  config = deepMerge(config, cliConfig);

  // 5. Apply profile presets if profile changed
  const profileFromCli = cliOptions.profile;
  const profileFromFile = fileConfig?.analysis?.profile;
  const profileFromEnv = envConfig.analysis?.profile as AnalysisProfile | undefined;
  const effectiveProfile =
    profileFromCli ?? profileFromEnv ?? profileFromFile ?? config.analysis.profile;

  if (effectiveProfile && effectiveProfile !== 'standard') {
    config.analysis = applyProfile(config.analysis, effectiveProfile);
  }

  // 6. Validate final config
  validateConfig(config);

  return config;
}

/**
 * Format configuration for display
 */
export function formatConfig(config: ChessBeastConfig): string {
  return JSON.stringify(config, null, 2);
}

export { ANALYSIS_PROFILES };
