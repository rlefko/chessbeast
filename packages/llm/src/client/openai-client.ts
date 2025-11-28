/**
 * OpenAI client wrapper with retry logic and error handling
 */

import OpenAILib from 'openai';

import type { LLMConfig } from '../config/llm-config.js';
import { LLMError, LLMErrorCode, RateLimitError, TimeoutError, APIError } from '../errors.js';

import { CircuitBreaker } from './circuit-breaker.js';
import type {
  LLMRequest,
  LLMResponse,
  TokenUsage,
  HealthStatus,
  CircuitState,
  StreamChunk,
} from './types.js';

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Add jitter to a delay (±25%)
 */
function addJitter(delayMs: number): number {
  const jitter = delayMs * 0.25 * (Math.random() * 2 - 1);
  return Math.round(delayMs + jitter);
}

/**
 * Token tracker for budget management
 */
export class TokenTracker {
  private used = 0;

  constructor(private readonly maxTokens: number) {}

  /**
   * Check if spending tokens would exceed budget
   */
  canSpend(tokens: number, reserve: number = 0): boolean {
    const available = this.maxTokens * (1 - reserve);
    return this.used + tokens <= available;
  }

  /**
   * Record token usage
   */
  spend(tokens: number): void {
    this.used += tokens;
  }

  /**
   * Get remaining token budget
   */
  get remaining(): number {
    return Math.max(0, this.maxTokens - this.used);
  }

  /**
   * Get total tokens used
   */
  get total(): number {
    return this.used;
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.used = 0;
  }
}

/**
 * OpenAI client with retry logic, circuit breaker, and token tracking
 */
export class OpenAIClient {
  private readonly client: OpenAILib;
  private readonly config: LLMConfig;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly tokenTracker: TokenTracker;
  private lastError: string | undefined;

  constructor(config: LLMConfig) {
    this.config = config;
    this.client = new OpenAILib({
      apiKey: config.apiKey,
      timeout: config.timeout,
    });
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    this.tokenTracker = new TokenTracker(config.budget.maxTokensPerGame);
  }

  /**
   * Send a chat completion request with retry logic
   */
  async chat(request: LLMRequest): Promise<LLMResponse> {
    return this.circuitBreaker.execute(async () => {
      return this.withRetry(() => this.doChat(request));
    });
  }

  /**
   * Get current health status
   */
  getHealthStatus(): HealthStatus {
    return {
      healthy: this.circuitBreaker.getState() !== 'open',
      circuitState: this.circuitBreaker.getState(),
      tokensUsed: this.tokenTracker.total,
      tokensRemaining: this.tokenTracker.remaining,
      consecutiveFailures: this.circuitBreaker.getFailureCount(),
      lastError: this.lastError,
    };
  }

  /**
   * Get token usage statistics
   */
  getTokenUsage(): { used: number; remaining: number } {
    return {
      used: this.tokenTracker.total,
      remaining: this.tokenTracker.remaining,
    };
  }

  /**
   * Check if we can afford to spend estimated tokens
   */
  canAfford(estimatedTokens: number): boolean {
    return this.tokenTracker.canSpend(estimatedTokens, this.config.budget.reserveForFallback);
  }

  /**
   * Reset token tracker for a new game
   */
  resetForNewGame(): void {
    this.tokenTracker.reset();
    this.lastError = undefined;
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  private async doChat(request: LLMRequest): Promise<LLMResponse> {
    try {
      const messages = request.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }));

      // Build request options
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options: any = {
        model: this.config.model,
        messages,
        temperature: request.temperature ?? this.config.temperature,
        max_tokens: request.maxTokens ?? null,
      };

      // Add reasoning effort for supported models (o1, o3, codex)
      const reasoningEffort = request.reasoningEffort ?? this.config.reasoningEffort;
      if (reasoningEffort && reasoningEffort !== 'none') {
        options.reasoning_effort = reasoningEffort;
      }

      // Add JSON format if requested
      if (request.responseFormat === 'json') {
        options.response_format = { type: 'json_object' };
      }

      // Use streaming if callback provided and streaming is enabled
      if (request.onChunk && this.config.streaming) {
        return this.doChatStreaming(options, request.onChunk);
      }

      // Non-streaming path
      const response = await this.client.chat.completions.create(options);

      const choice = response.choices[0];
      if (!choice) {
        throw new LLMError('No response from LLM', LLMErrorCode.INVALID_RESPONSE, false);
      }

      // Extract reasoning content if present (for non-streaming reasoning models)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = choice.message as any;
      const thinkingContent = message.reasoning_content ?? undefined;

      const usage: TokenUsage = {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thinkingTokens: (response.usage as any)?.reasoning_tokens ?? undefined,
      };

      // Track token usage
      this.tokenTracker.spend(usage.totalTokens);

      return {
        content: choice.message.content ?? '',
        finishReason: this.mapFinishReason(choice.finish_reason),
        usage,
        thinkingContent,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Streaming chat completion with real-time chunk callbacks
   */
  private async doChatStreaming(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<LLMResponse> {
    options.stream = true;
    // Request usage in final streaming chunk
    options.stream_options = { include_usage: true };

    // Create stream - TypeScript SDK returns AsyncIterable when stream: true
    const stream = await this.client.chat.completions.create({
      ...options,
      stream: true,
    } as Parameters<typeof this.client.chat.completions.create>[0] & { stream: true });

    let content = '';
    let thinkingContent = '';
    let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finishReason: 'stop' | 'length' | 'content_filter' = 'stop';

    // Stream is an async iterable
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delta = choice?.delta as any;

      // Handle thinking/reasoning content
      if (delta?.reasoning_content) {
        thinkingContent += delta.reasoning_content;
        onChunk({ type: 'thinking', text: delta.reasoning_content, done: false });
      }

      // Handle regular content
      if (delta?.content) {
        content += delta.content;
        onChunk({ type: 'content', text: delta.content, done: false });
      }

      // Capture finish reason
      if (choice?.finish_reason) {
        finishReason = this.mapFinishReason(choice.finish_reason);
      }

      // Track usage from final chunk (when include_usage is true)
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0,
          totalTokens: chunk.usage.total_tokens ?? 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          thinkingTokens: (chunk.usage as any).reasoning_tokens ?? undefined,
        };
      }
    }

    // Signal completion
    onChunk({ type: 'content', text: '', done: true });

    // Track token usage
    this.tokenTracker.spend(usage.totalTokens);

    // Build response with optional thinkingContent (avoid undefined for exactOptionalPropertyTypes)
    const response: LLMResponse = {
      content,
      finishReason,
      usage,
    };
    if (thinkingContent) {
      response.thinkingContent = thinkingContent;
    }

    return response;
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    const config = this.config.retry;
    let lastError: Error | undefined;
    let delay = config.initialDelayMs;
    let rateLimitAttempts = 0;
    const maxRateLimitRetries = 5; // More retries specifically for rate limits

    for (let attempt = 0; attempt <= config.maxRetries + maxRateLimitRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        this.lastError = lastError.message;

        // Check if error is retryable
        if (error instanceof LLMError && !error.retryable) {
          throw error;
        }

        // Handle rate limiting specially - more retries and longer waits
        if (error instanceof RateLimitError) {
          rateLimitAttempts++;
          // Rate limits get extra retries
          if (rateLimitAttempts <= maxRateLimitRetries) {
            // Use retry-after from header with jitter, minimum 5 seconds
            const rateLimitDelay = addJitter(Math.max(5000, error.retryAfterMs));
            console.warn(
              `Rate limited (attempt ${rateLimitAttempts}/${maxRateLimitRetries}), waiting ${rateLimitDelay}ms...`,
            );
            await sleep(rateLimitDelay);
            continue;
          }
        }

        // Don't retry on last attempt for non-rate-limit errors
        const nonRateLimitAttempt = attempt - rateLimitAttempts;
        if (nonRateLimitAttempt < config.maxRetries) {
          const delayWithJitter = addJitter(delay);
          await sleep(delayWithJitter);
          delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
        } else {
          // Exhausted retries
          break;
        }
      }
    }

    throw lastError;
  }

  private mapError(error: unknown): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    if (error instanceof OpenAILib.APIError) {
      // Handle rate limiting
      if (error.status === 429) {
        const retryAfter = this.parseRetryAfter(error);
        return new RateLimitError(retryAfter, error);
      }

      // Handle timeout
      if (error.status === 408 || error.message.includes('timeout')) {
        return new TimeoutError('chat', this.config.timeout, error);
      }

      // General API error
      return new APIError(error.message, error.status, error);
    }

    // Unknown error
    return new LLMError(
      error instanceof Error ? error.message : String(error),
      LLMErrorCode.API_ERROR,
      true,
    );
  }

  private parseRetryAfter(error: { headers?: Record<string, string> }): number {
    // Try to parse retry-after header
    const headers = error.headers;
    if (headers) {
      const retryAfter = headers['retry-after'];
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
          return seconds * 1000;
        }
      }
    }
    // Default to 5 seconds
    return 5000;
  }

  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'content_filter' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
