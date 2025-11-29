/**
 * Configuration schema types for ChessBeast CLI
 */

/**
 * Analysis profile presets
 */
export type AnalysisProfile = 'quick' | 'standard' | 'deep';

/**
 * Output verbosity levels (maps to LLM VerbosityLevel)
 */
export type OutputVerbosity = 'summary' | 'normal' | 'rich';

/**
 * Annotation perspective (whose point of view)
 */
export type AnnotationPerspective = 'white' | 'black' | 'neutral';

/**
 * Reasoning effort level for OpenAI reasoning models (o1, o3, codex)
 */
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'none';

/**
 * Analysis configuration
 */
export interface AnalysisConfigSchema {
  /** Analysis profile preset */
  profile: AnalysisProfile;
  /** Depth for shallow pass (all positions) */
  shallowDepth: number;
  /** Time limit per position for shallow pass (ms) */
  shallowTimeLimitMs: number;
  /** Depth for deep pass (critical moments only) */
  deepDepth: number;
  /** Time limit per position for deep pass (ms) */
  deepTimeLimitMs: number;
  /** Number of principal variations for critical moments */
  multiPvCount: number;
  /** Maximum ratio of moves to mark as critical (0.0-1.0) */
  maxCriticalRatio: number;
  /** Skip Maia human-likeness analysis */
  skipMaia: boolean;
  /** Skip LLM annotations (template only) */
  skipLlm: boolean;
}

/**
 * Rating configuration
 */
export interface RatingsConfigSchema {
  /** Target audience rating for annotations */
  targetAudienceRating?: number;
  /** Default rating when player rating unknown */
  defaultRating: number;
}

/**
 * LLM configuration
 */
export interface LLMConfigSchema {
  /** OpenAI API key (from env var) */
  apiKey?: string;
  /** Model to use */
  model: string;
  /** Temperature for generation (0.0-2.0) */
  temperature: number;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Maximum tokens per game (default: 50000) */
  tokenBudget?: number;
  /** Reasoning effort for o1/o3/codex models (default: 'medium') */
  reasoningEffort?: ReasoningEffort;
  /** Enable streaming for real-time thought display (default: true) */
  streaming?: boolean;
}

/**
 * Agentic annotation configuration
 */
export interface AgenticConfigSchema {
  /** Enable agentic annotation mode (default: false) */
  enabled: boolean;
  /** Annotate all moves, not just critical (default: false) */
  annotateAll: boolean;
  /** Maximum tool calls per position (default: 5) */
  maxToolCalls: number;
  /** Show cost summary at end (default: true) */
  showCosts: boolean;
  /** Enable agentic variation exploration (default: false) */
  agenticExploration: boolean;
  /** Maximum tool calls for exploration (default: 40) */
  explorationMaxToolCalls: number;
  /** Maximum depth for variation exploration (default: 50) */
  explorationMaxDepth: number;
}

/**
 * Service endpoint configuration
 */
export interface ServiceEndpoint {
  /** Service host */
  host: string;
  /** Service port */
  port: number;
  /** Request timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Services configuration
 */
export interface ServicesConfigSchema {
  /** Stockfish engine service */
  stockfish: ServiceEndpoint;
  /** Maia human-likeness service */
  maia: ServiceEndpoint;
}

/**
 * Database paths configuration
 */
export interface DatabasesConfigSchema {
  /** Path to ECO opening database */
  ecoPath: string;
  /** Path to Lichess Elite database */
  lichessPath: string;
}

/**
 * Output configuration
 */
export interface OutputConfigSchema {
  /** Annotation verbosity level */
  verbosity: OutputVerbosity;
  /** Include variations in output PGN */
  includeVariations: boolean;
  /** Include NAG symbols */
  includeNags: boolean;
  /** Include game summary */
  includeSummary: boolean;
  /** Annotation perspective (white, black, or neutral) */
  perspective: AnnotationPerspective;
}

/**
 * Complete ChessBeast configuration
 */
export interface ChessBeastConfig {
  /** Analysis settings */
  analysis: AnalysisConfigSchema;
  /** Rating settings */
  ratings: RatingsConfigSchema;
  /** LLM settings */
  llm: LLMConfigSchema;
  /** Agentic annotation settings */
  agentic: AgenticConfigSchema;
  /** Service endpoints */
  services: ServicesConfigSchema;
  /** Database paths */
  databases: DatabasesConfigSchema;
  /** Output settings */
  output: OutputConfigSchema;
}

/**
 * CLI options from command line arguments
 */
export interface CliOptions {
  /** Input PGN file path (undefined = stdin) */
  input?: string;
  /** Output file path (undefined = stdout) */
  output?: string;
  /** Path to config file */
  config?: string;
  /** Analysis profile */
  profile?: AnalysisProfile;
  /** Output verbosity */
  verbosity?: OutputVerbosity;
  /** Target audience ELO rating */
  targetElo?: number;
  /** Skip Maia analysis */
  skipMaia?: boolean;
  /** Skip LLM annotations */
  skipLlm?: boolean;
  /** Print resolved config and exit */
  showConfig?: boolean;
  /** Disable colored output */
  noColor?: boolean;
  /** Validate setup without running analysis */
  dryRun?: boolean;
  /** Annotation perspective */
  perspective?: AnnotationPerspective;
  /** Maximum tokens per game for LLM */
  tokenBudget?: number;
  /** OpenAI model to use */
  model?: string;
  /** Reasoning effort for LLM (none, low, medium, high) */
  reasoningEffort?: ReasoningEffort;
  /** Enable verbose output with real-time LLM reasoning display */
  verbose?: boolean;
  /** Enable detailed debug output with full LLM reasoning and tool call details */
  debug?: boolean;
  /** Enable agentic annotation with tool calling */
  agentic?: boolean;
  /** Use agentic annotation for all moves, not just critical */
  agenticAll?: boolean;
  /** Maximum tool calls per position in agentic mode */
  maxToolCalls?: number;
  /** Show cost summary at end of analysis */
  showCosts?: boolean;
  /** Enable agentic variation exploration */
  agenticExploration?: boolean;
  /** Maximum tool calls for agentic exploration */
  explorationMaxToolCalls?: number;
  /** Maximum depth for agentic exploration */
  explorationMaxDepth?: number;
}
