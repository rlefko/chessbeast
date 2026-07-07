/**
 * Mock LLM client for testing the annotation pipeline without OpenAI.
 *
 * Structurally matches the surface of OpenAIClient that the post-write
 * pipeline uses (chat), so tests can inject it as Services.llmClient.
 */

import { vi } from 'vitest';

/**
 * Chat request shape consumed by the mock (subset of the real LLMRequest)
 */
export interface MockChatRequest {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Chat response shape produced by the mock (subset of the real LLMResponse)
 */
export interface MockChatResponse {
  content: string;
  finishReason: 'stop';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Configuration for the mock LLM client
 */
export interface MockLlmClientConfig {
  /** Comment returned when no annotation entry matches (default: a neutral coaching line) */
  defaultComment?: string;
  /** Map from a SAN (or any substring found in the prompt) to a canned comment */
  annotations?: Map<string, string>;
  /** When set, every chat() call rejects with this error */
  error?: Error;
  /** Artificial latency per call in milliseconds */
  latencyMs?: number;
}

/**
 * Mock LLM client with call recording
 */
export interface MockLlmClient {
  chat: ReturnType<typeof vi.fn<(request: MockChatRequest) => Promise<MockChatResponse>>>;
  /** All chat requests received, in order */
  _getCalls: () => MockChatRequest[];
  /** Clear recorded calls */
  _reset: () => void;
}

const DEFAULT_COMMENT = 'A solid choice that keeps the position balanced.';

/**
 * Create a mock LLM client
 */
export function createMockLlmClient(config: MockLlmClientConfig = {}): MockLlmClient {
  const { defaultComment = DEFAULT_COMMENT, annotations, error, latencyMs } = config;
  const calls: MockChatRequest[] = [];

  const chat = vi.fn(async (request: MockChatRequest): Promise<MockChatResponse> => {
    calls.push(request);

    if (latencyMs) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
    }
    if (error) {
      throw error;
    }

    // Match canned annotations against the user prompt content
    let content = defaultComment;
    if (annotations) {
      const prompt = request.messages.map((m) => m.content).join('\n');
      for (const [key, comment] of annotations) {
        if (prompt.includes(key)) {
          content = comment;
          break;
        }
      }
    }

    return {
      content,
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 25, totalTokens: 125 },
    };
  });

  return {
    chat,
    _getCalls: (): MockChatRequest[] => calls,
    _reset: (): void => {
      calls.length = 0;
      chat.mockClear();
    },
  };
}
