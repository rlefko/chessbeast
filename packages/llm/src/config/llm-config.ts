/**
 * Configuration types and defaults for LLM operations
 */

/**
 * Token budget configuration
 */
export interface TokenBudget {
  /** Maximum tokens to use per game (default: 10000) */
  maxTokensPerGame: number;
  /** Maximum tokens per individual comment (default: 500) */
  maxTokensPerComment: number;
  /** Maximum tokens for game summary (default: 1500) */
  maxTokensPerSummary: number;
  /** Reserve percentage for fallback operations (default: 0.1 = 10%) */
  reserveForFallback: number;
}

/**
 * Retry configuration for API calls
 */
export interface RetryConfig {
  /** Maximum number of retries (default: 3) */
  maxRetries: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold: number;
  /** Number of successes in half-open state before closing (default: 2) */
  successThreshold: number;
  /** Time in open state before transitioning to half-open (default: 30000ms) */
  resetTimeoutMs: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Maximum number of entries in the response cache (default: 1000) */
  maxSize: number;
  /** Time-to-live for cache entries in milliseconds (default: 3600000 = 1 hour) */
  ttlMs: number;
}

/**
 * Main LLM configuration
 */
export interface LLMConfig {
  /** OpenAI API key (required) */
  apiKey: string;
  /** Model to use (default: 'gpt-5.1') */
  model: string;
  /** Temperature for generation (default: 0.7) */
  temperature: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeout: number;
  /** Token budget settings */
  budget: TokenBudget;
  /** Retry settings */
  retry: RetryConfig;
  /** Circuit breaker settings */
  circuitBreaker: CircuitBreakerConfig;
  /** Cache settings */
  cache: CacheConfig;
}

/**
 * Default token budget configuration
 *
 * NOTE: With gpt-4o-mini (~$0.15/1M input, ~$0.60/1M output), 100k tokens costs ~$0.05
 * So we can be very generous with the budget without significant cost impact.
 */
export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  maxTokensPerGame: 100000, // Very generous - allows thorough annotation of any game
  maxTokensPerComment: 500,
  maxTokensPerSummary: 1500,
  reserveForFallback: 0.02, // Minimal reserve - prefer LLM annotation over silence
};

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30000,
};

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 1000,
  ttlMs: 3600000, // 1 hour
};

/**
 * Default LLM configuration (requires apiKey to be provided)
 */
export const DEFAULT_LLM_CONFIG: Omit<LLMConfig, 'apiKey'> = {
  model: process.env['OPENAI_MODEL'] ?? 'gpt-5.1',
  temperature: 0.7,
  timeout: parseInt(process.env['LLM_TIMEOUT_MS'] ?? '30000', 10),
  budget: DEFAULT_TOKEN_BUDGET,
  retry: DEFAULT_RETRY_CONFIG,
  circuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
  cache: DEFAULT_CACHE_CONFIG,
};

/**
 * Create a full LLM config with defaults for unspecified values
 */
export function createLLMConfig(partial: Partial<LLMConfig> & { apiKey: string }): LLMConfig {
  return {
    ...DEFAULT_LLM_CONFIG,
    ...partial,
    budget: { ...DEFAULT_TOKEN_BUDGET, ...partial.budget },
    retry: { ...DEFAULT_RETRY_CONFIG, ...partial.retry },
    circuitBreaker: { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...partial.circuitBreaker },
    cache: { ...DEFAULT_CACHE_CONFIG, ...partial.cache },
  };
}

/**
 * Load LLM config from environment variables
 */
export function loadConfigFromEnv(): Partial<LLMConfig> {
  const config: Partial<LLMConfig> = {};

  if (process.env['OPENAI_API_KEY']) {
    config.apiKey = process.env['OPENAI_API_KEY'];
  }

  if (process.env['OPENAI_MODEL']) {
    config.model = process.env['OPENAI_MODEL'];
  }

  if (process.env['LLM_TIMEOUT_MS']) {
    config.timeout = parseInt(process.env['LLM_TIMEOUT_MS'], 10);
  }

  if (process.env['LLM_MAX_TOKENS_PER_GAME']) {
    config.budget = {
      ...DEFAULT_TOKEN_BUDGET,
      maxTokensPerGame: parseInt(process.env['LLM_MAX_TOKENS_PER_GAME'], 10),
    };
  }

  return config;
}
