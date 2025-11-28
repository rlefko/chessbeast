/**
 * Types for LLM client operations
 */

import type { ReasoningEffort } from '../config/llm-config.js';

/**
 * Message role in conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * Streaming chunk from LLM
 */
export interface StreamChunk {
  /** Type of content: 'thinking' for reasoning, 'content' for response */
  type: 'thinking' | 'content';
  /** Text content of this chunk */
  text: string;
  /** Whether this is the final chunk */
  done: boolean;
}

/**
 * Chat message
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/**
 * Request to the LLM
 */
export interface LLMRequest {
  /** Messages in the conversation */
  messages: ChatMessage[];
  /** Override temperature for this request */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Response format (json for structured output) */
  responseFormat?: 'text' | 'json';
  /** Reasoning effort for o1/o3/codex models */
  reasoningEffort?: ReasoningEffort;
  /** Streaming callback for real-time response chunks */
  onChunk?: (chunk: StreamChunk) => void;
}

/**
 * Response from the LLM
 */
export interface LLMResponse {
  /** Generated content */
  content: string;
  /** Finish reason */
  finishReason: 'stop' | 'length' | 'content_filter';
  /** Token usage */
  usage: TokenUsage;
  /** Reasoning/thinking content from reasoning models (if any) */
  thinkingContent?: string;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  /** Tokens in the prompt */
  promptTokens: number;
  /** Tokens in the completion */
  completionTokens: number;
  /** Total tokens used */
  totalTokens: number;
  /** Tokens used for reasoning/thinking (if reasoning model) */
  thinkingTokens?: number;
}

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Health status of the LLM service
 */
export interface HealthStatus {
  /** Is the service healthy? */
  healthy: boolean;
  /** Circuit breaker state */
  circuitState: CircuitState;
  /** Total tokens used in current session */
  tokensUsed: number;
  /** Remaining token budget */
  tokensRemaining: number;
  /** Number of consecutive failures */
  consecutiveFailures: number;
  /** Last error message if any */
  lastError: string | undefined;
}
