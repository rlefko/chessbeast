/**
 * Configuration loading from files, environment variables, and CLI arguments
 */

import { cosmiconfig } from 'cosmiconfig';

import { DEFAULT_CONFIG, applyProfile, ANALYSIS_PROFILES } from './defaults.js';
import type { ChessBeastConfig, CliOptions, AnalysisProfile, OutputVerbosity } from './schema.js';
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
  if (path.includes('skip') || path.includes('include')) {
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
    path.includes('Ratio')
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

  if (options.targetElo !== undefined) {
    config.ratings = {
      ...config.ratings,
      targetAudienceRating: options.targetElo,
    } as ChessBeastConfig['ratings'];
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
