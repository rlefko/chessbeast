/**
 * Error classes for LLM operations
 */

/**
 * Error codes for LLM operations
 */
export enum LLMErrorCode {
  /** API rate limit exceeded */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Token budget for the game exceeded */
  TOKEN_BUDGET_EXCEEDED = 'TOKEN_BUDGET_EXCEEDED',
  /** Invalid response from LLM */
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  /** General API error */
  API_ERROR = 'API_ERROR',
  /** Request timed out */
  TIMEOUT = 'TIMEOUT',
  /** Output validation failed */
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  /** Circuit breaker is open */
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
}

/**
 * Base error class for LLM operations
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: LLMErrorCode,
    public readonly retryable: boolean,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'LLMError';
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LLMError);
    }
  }
}

/**
 * Error thrown when API rate limit is exceeded
 */
export class RateLimitError extends LLMError {
  constructor(
    public readonly retryAfterMs: number,
    cause?: Error,
  ) {
    super(
      `Rate limited, retry after ${retryAfterMs}ms`,
      LLMErrorCode.RATE_LIMITED,
      true,
      cause,
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Error thrown when token budget is exceeded
 */
export class TokenBudgetExceededError extends LLMError {
  constructor(
    public readonly requested: number,
    public readonly budget: number,
  ) {
    super(
      `Token budget exceeded: requested ${requested}, budget remaining ${budget}`,
      LLMErrorCode.TOKEN_BUDGET_EXCEEDED,
      false,
    );
    this.name = 'TokenBudgetExceededError';
  }
}

/**
 * Error thrown when LLM response validation fails
 */
export class ValidationError extends LLMError {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown,
  ) {
    super(message, LLMErrorCode.VALIDATION_FAILED, false);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when API request times out
 */
export class TimeoutError extends LLMError {
  constructor(
    public readonly operation: string,
    public readonly timeoutMs: number,
    cause?: Error,
  ) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      LLMErrorCode.TIMEOUT,
      true,
      cause,
    );
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitOpenError extends LLMError {
  constructor(
    public readonly openedAt: Date,
    public readonly resetAfterMs: number,
  ) {
    super(
      `Circuit breaker is open since ${openedAt.toISOString()}, reset in ${resetAfterMs}ms`,
      LLMErrorCode.CIRCUIT_OPEN,
      true,
    );
    this.name = 'CircuitOpenError';
  }
}

/**
 * Error thrown for general API errors
 */
export class APIError extends LLMError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    cause?: Error,
  ) {
    super(message, LLMErrorCode.API_ERROR, statusCode !== 400, cause);
    this.name = 'APIError';
  }
}
