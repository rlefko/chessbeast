/**
 * Configuration schema types for ChessBeast CLI
 */

/**
 * Analysis profile presets
 */
export type AnalysisProfile = 'quick' | 'standard' | 'deep';

/**
 * Output verbosity levels (deprecated - no longer affects comment style)
 * Kept for backwards compatibility
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
 * Analysis speed / tier configuration
 */
export type AnalysisSpeed = 'fast' | 'normal' | 'deep';

/**
 * Theme output verbosity
 */
export type ThemeVerbosity = 'none' | 'important' | 'all';

/**
 * Variation exploration depth
 */
export type VariationDepth = 'low' | 'medium' | 'high';

/**
 * Comment density control
 */
export type CommentDensity = 'sparse' | 'normal' | 'verbose';

/**
 * Target audience level for annotations
 */
export type AudienceLevel = 'beginner' | 'club' | 'expert';

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
  /** Minimum time for mate/winning positions (ms) - ensures deeper search */
  mateMinTimeMs?: number;
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
 * Optional service endpoint configuration (with enabled flag)
 */
export interface OptionalServiceEndpoint {
  /** Service host */
  host: string;
  /** Service port */
  port: number;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Whether the service is enabled */
  enabled: boolean;
}

/**
 * Services configuration
 */
export interface ServicesConfigSchema {
  /** Stockfish engine service */
  stockfish: ServiceEndpoint;
  /** Maia human-likeness service */
  maia: ServiceEndpoint;
  /** Stockfish 16 classical eval service (optional) */
  stockfish16?: OptionalServiceEndpoint;
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
 * Ultra-Fast Coach configuration
 *
 * Settings for the new architecture with staged analysis,
 * theme detection, and post-write comment synthesis.
 */
export interface UltraFastCoachConfigSchema {
  /** Enable Ultra-Fast Coach annotation mode */
  enabled: boolean;
  /** Analysis speed tier */
  speed: AnalysisSpeed;
  /** Theme output verbosity */
  themes: ThemeVerbosity;
  /** Variation exploration depth */
  variations: VariationDepth;
  /** Comment density control */
  commentDensity: CommentDensity;
  /** Target audience level */
  audience: AudienceLevel;
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
  /** Service endpoints */
  services: ServicesConfigSchema;
  /** Database paths */
  databases: DatabasesConfigSchema;
  /** Output settings */
  output: OutputConfigSchema;
  /** Ultra-Fast Coach settings */
  ultraFastCoach: UltraFastCoachConfigSchema;
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
  /** Analysis speed tier (fast/normal/deep) */
  speed?: AnalysisSpeed;
  /** Theme output verbosity (none/important/all) */
  themes?: ThemeVerbosity;
  /** Variation exploration depth (low/medium/high) */
  variations?: VariationDepth;
  /** Comment density control (sparse/normal/verbose) */
  commentDensity?: CommentDensity;
  /** Target audience level (beginner/club/expert) */
  audience?: AudienceLevel;
  /** Enable Ultra-Fast Coach annotation mode */
  ultraFastCoach?: boolean;
  /** Enable Debug GUI WebSocket server (port number or true for default) */
  debugGui?: number | boolean;
}
