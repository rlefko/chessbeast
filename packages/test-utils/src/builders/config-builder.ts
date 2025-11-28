/**
 * Fluent builder for ChessBeastConfig test data
 *
 * Note: Types are inlined to avoid circular dependency with @chessbeast/cli
 */

/**
 * Analysis profile presets
 */
export type AnalysisProfile = 'quick' | 'standard' | 'deep';

/**
 * Output verbosity levels
 */
export type OutputVerbosity = 'summary' | 'normal' | 'rich';

/**
 * Annotation perspective (whose point of view)
 */
export type AnnotationPerspective = 'white' | 'black' | 'neutral';

/**
 * Analysis configuration
 */
export interface AnalysisConfigSchema {
  profile: AnalysisProfile;
  shallowDepth: number;
  shallowTimeLimitMs: number;
  deepDepth: number;
  deepTimeLimitMs: number;
  multiPvCount: number;
  maxCriticalRatio: number;
  skipMaia: boolean;
  skipLlm: boolean;
}

/**
 * Rating configuration
 */
export interface RatingsConfigSchema {
  targetAudienceRating?: number;
  defaultRating: number;
}

/**
 * Reasoning effort level for OpenAI reasoning models
 */
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'none';

/**
 * LLM configuration
 */
export interface LLMConfigSchema {
  apiKey?: string;
  model: string;
  temperature: number;
  timeout: number;
  reasoningEffort?: ReasoningEffort;
  streaming?: boolean;
}

/**
 * Agentic annotation configuration
 */
export interface AgenticConfigSchema {
  enabled: boolean;
  annotateAll: boolean;
  maxToolCalls: number;
  showCosts: boolean;
}

/**
 * Service endpoint configuration
 */
export interface ServiceEndpoint {
  host: string;
  port: number;
  timeoutMs: number;
}

/**
 * Services configuration
 */
export interface ServicesConfigSchema {
  stockfish: ServiceEndpoint;
  maia: ServiceEndpoint;
}

/**
 * Database paths configuration
 */
export interface DatabasesConfigSchema {
  ecoPath: string;
  lichessPath: string;
}

/**
 * Output configuration
 */
export interface OutputConfigSchema {
  verbosity: OutputVerbosity;
  includeVariations: boolean;
  includeNags: boolean;
  includeSummary: boolean;
  perspective: AnnotationPerspective;
}

/**
 * Complete ChessBeast configuration
 */
export interface ChessBeastConfig {
  analysis: AnalysisConfigSchema;
  ratings: RatingsConfigSchema;
  llm: LLMConfigSchema;
  agentic: AgenticConfigSchema;
  services: ServicesConfigSchema;
  databases: DatabasesConfigSchema;
  output: OutputConfigSchema;
}

/**
 * Analysis profile presets
 */
const ANALYSIS_PROFILES: Record<AnalysisProfile, Partial<AnalysisConfigSchema>> = {
  quick: {
    shallowDepth: 12,
    shallowTimeLimitMs: 2000,
    deepDepth: 16,
    deepTimeLimitMs: 5000,
    multiPvCount: 1,
    maxCriticalRatio: 0.15,
  },
  standard: {
    shallowDepth: 14,
    shallowTimeLimitMs: 3000,
    deepDepth: 22,
    deepTimeLimitMs: 10000,
    multiPvCount: 3,
    maxCriticalRatio: 0.25,
  },
  deep: {
    shallowDepth: 18,
    shallowTimeLimitMs: 5000,
    deepDepth: 28,
    deepTimeLimitMs: 20000,
    multiPvCount: 5,
    maxCriticalRatio: 0.35,
  },
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ChessBeastConfig = {
  analysis: {
    profile: 'standard',
    shallowDepth: 14,
    shallowTimeLimitMs: 3000,
    deepDepth: 22,
    deepTimeLimitMs: 10000,
    multiPvCount: 3,
    maxCriticalRatio: 0.25,
    skipMaia: false,
    skipLlm: false,
  },
  ratings: {
    defaultRating: 1500,
  },
  llm: {
    model: 'gpt-5-codex',
    temperature: 0.7,
    timeout: 30000,
    reasoningEffort: 'medium',
    streaming: true,
  },
  agentic: {
    enabled: false,
    annotateAll: false,
    maxToolCalls: 5,
    showCosts: true,
  },
  services: {
    stockfish: {
      host: 'localhost',
      port: 50051,
      timeoutMs: 60000,
    },
    maia: {
      host: 'localhost',
      port: 50052,
      timeoutMs: 30000,
    },
  },
  databases: {
    ecoPath: 'data/eco.db',
    lichessPath: 'data/lichess_elite.db',
  },
  output: {
    verbosity: 'normal',
    includeVariations: true,
    includeNags: true,
    includeSummary: true,
    perspective: 'neutral',
  },
};

/**
 * Apply profile presets to analysis configuration
 */
function applyProfile(
  config: AnalysisConfigSchema,
  profile: AnalysisProfile,
): AnalysisConfigSchema {
  const profilePreset = ANALYSIS_PROFILES[profile];
  return {
    ...config,
    ...profilePreset,
    profile,
  };
}

/**
 * Fluent builder for creating ChessBeastConfig instances
 */
export class ConfigBuilder {
  private config: ChessBeastConfig;

  constructor() {
    // Deep clone the default config
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  /**
   * Apply an analysis profile (quick, standard, deep)
   */
  withProfile(profile: AnalysisProfile): this {
    this.config.analysis = applyProfile(this.config.analysis, profile);
    return this;
  }

  /**
   * Set analysis depth settings
   */
  withDepths(shallowDepth: number, deepDepth: number): this {
    this.config.analysis.shallowDepth = shallowDepth;
    this.config.analysis.deepDepth = deepDepth;
    return this;
  }

  /**
   * Set multi-PV count
   */
  withMultiPv(count: number): this {
    this.config.analysis.multiPvCount = count;
    return this;
  }

  /**
   * Set max critical ratio
   */
  withMaxCriticalRatio(ratio: number): this {
    this.config.analysis.maxCriticalRatio = ratio;
    return this;
  }

  /**
   * Skip Maia analysis
   */
  withSkipMaia(skip: boolean = true): this {
    this.config.analysis.skipMaia = skip;
    return this;
  }

  /**
   * Skip LLM annotations
   */
  withSkipLlm(skip: boolean = true): this {
    this.config.analysis.skipLlm = skip;
    return this;
  }

  /**
   * Set target audience rating
   */
  withTargetRating(rating: number): this {
    this.config.ratings.targetAudienceRating = rating;
    return this;
  }

  /**
   * Set default rating
   */
  withDefaultRating(rating: number): this {
    this.config.ratings.defaultRating = rating;
    return this;
  }

  /**
   * Set LLM model
   */
  withLlmModel(model: string): this {
    this.config.llm.model = model;
    return this;
  }

  /**
   * Set LLM API key
   */
  withLlmApiKey(apiKey: string): this {
    this.config.llm.apiKey = apiKey;
    return this;
  }

  /**
   * Set LLM temperature
   */
  withLlmTemperature(temperature: number): this {
    this.config.llm.temperature = temperature;
    return this;
  }

  /**
   * Set LLM reasoning effort
   */
  withReasoningEffort(effort: ReasoningEffort): this {
    this.config.llm.reasoningEffort = effort;
    return this;
  }

  /**
   * Set LLM streaming enabled/disabled
   */
  withStreaming(enabled: boolean): this {
    this.config.llm.streaming = enabled;
    return this;
  }

  /**
   * Configure agentic annotation options
   */
  withAgentic(options: {
    enabled?: boolean;
    annotateAll?: boolean;
    maxToolCalls?: number;
    showCosts?: boolean;
  }): this {
    if (options.enabled !== undefined) {
      this.config.agentic.enabled = options.enabled;
    }
    if (options.annotateAll !== undefined) {
      this.config.agentic.annotateAll = options.annotateAll;
    }
    if (options.maxToolCalls !== undefined) {
      this.config.agentic.maxToolCalls = options.maxToolCalls;
    }
    if (options.showCosts !== undefined) {
      this.config.agentic.showCosts = options.showCosts;
    }
    return this;
  }

  /**
   * Set output verbosity
   */
  withVerbosity(verbosity: OutputVerbosity): this {
    this.config.output.verbosity = verbosity;
    return this;
  }

  /**
   * Configure output options
   */
  withOutput(options: {
    includeVariations?: boolean;
    includeNags?: boolean;
    includeSummary?: boolean;
  }): this {
    if (options.includeVariations !== undefined) {
      this.config.output.includeVariations = options.includeVariations;
    }
    if (options.includeNags !== undefined) {
      this.config.output.includeNags = options.includeNags;
    }
    if (options.includeSummary !== undefined) {
      this.config.output.includeSummary = options.includeSummary;
    }
    return this;
  }

  /**
   * Set Stockfish service configuration
   */
  withStockfishService(host: string, port: number, timeoutMs?: number): this {
    this.config.services.stockfish.host = host;
    this.config.services.stockfish.port = port;
    if (timeoutMs !== undefined) {
      this.config.services.stockfish.timeoutMs = timeoutMs;
    }
    return this;
  }

  /**
   * Set Maia service configuration
   */
  withMaiaService(host: string, port: number, timeoutMs?: number): this {
    this.config.services.maia.host = host;
    this.config.services.maia.port = port;
    if (timeoutMs !== undefined) {
      this.config.services.maia.timeoutMs = timeoutMs;
    }
    return this;
  }

  /**
   * Set database paths
   */
  withDatabases(ecoPath: string, lichessPath: string): this {
    this.config.databases.ecoPath = ecoPath;
    this.config.databases.lichessPath = lichessPath;
    return this;
  }

  /**
   * Set full analysis config
   */
  withAnalysis(analysis: Partial<AnalysisConfigSchema>): this {
    this.config.analysis = { ...this.config.analysis, ...analysis };
    return this;
  }

  /**
   * Build the final config
   */
  build(): ChessBeastConfig {
    return JSON.parse(JSON.stringify(this.config));
  }
}

/**
 * Factory function for creating a builder
 */
export function config(): ConfigBuilder {
  return new ConfigBuilder();
}

/**
 * Quick config presets
 */
export const configPresets = {
  /** Quick analysis config */
  quick: (): ChessBeastConfig => config().withProfile('quick').build(),

  /** Standard analysis config */
  standard: (): ChessBeastConfig => config().withProfile('standard').build(),

  /** Deep analysis config */
  deep: (): ChessBeastConfig => config().withProfile('deep').build(),

  /** Config with no LLM */
  noLlm: (): ChessBeastConfig => config().withSkipLlm().build(),

  /** Config with no Maia */
  noMaia: (): ChessBeastConfig => config().withSkipMaia().build(),

  /** Minimal config (no LLM or Maia) */
  minimal: (): ChessBeastConfig => config().withSkipLlm().withSkipMaia().build(),

  /** Test config with fake API key */
  test: (): ChessBeastConfig => config().withLlmApiKey('test-api-key').build(),
};
