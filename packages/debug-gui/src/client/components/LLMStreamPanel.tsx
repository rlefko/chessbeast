/**
 * LLM Stream Panel
 *
 * Displays real-time LLM output, reasoning, and token usage.
 */

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { Panel } from './Panel.js';
import { useDebugStore } from '../state/store.js';

export interface LLMStreamPanelProps {
  focused?: boolean | undefined;
  width?: string | number | undefined;
  height?: string | number | undefined;
}

export function LLMStreamPanel({ focused = false, width, height }: LLMStreamPanelProps) {
  const { llm } = useDebugStore();

  return (
    <Panel title="LLM Stream" focused={focused} width={width} height={height}>
      <Box flexDirection="column">
        {/* Current move being processed */}
        <Box marginBottom={1}>
          {llm.currentMove ? (
            <Box>
              <Text bold color="cyan">
                {llm.currentMove}
              </Text>
              {llm.isStreaming && (
                <Text color="yellow">
                  {' '}
                  <Spinner type="dots" />
                </Text>
              )}
              {llm.model && (
                <Text dimColor> [{llm.model}]</Text>
              )}
            </Box>
          ) : (
            <Text dimColor>Waiting for LLM stream...</Text>
          )}
        </Box>

        {/* Reasoning/thinking content */}
        {llm.reasoning && (
          <Box flexDirection="column" marginBottom={1}>
            <Text dimColor>
              {llm.isThinking ? (
                <>
                  <Text color="yellow">
                    <Spinner type="dots" />
                  </Text>
                  {' Thinking...'}
                </>
              ) : (
                '--- Reasoning ---'
              )}
            </Text>
            <Box>
              <Text color="gray" wrap="wrap">
                {truncateText(llm.reasoning, 500)}
              </Text>
            </Box>
          </Box>
        )}

        {/* Generated comment */}
        {llm.content && (
          <Box flexDirection="column" marginBottom={1}>
            <Text dimColor>--- Generated Comment ---</Text>
            <Box>
              <Text color="green" wrap="wrap">
                {llm.content}
                {llm.isStreaming && !llm.isThinking && (
                  <Text color="green">_</Text>
                )}
              </Text>
            </Box>
          </Box>
        )}

        {/* Token usage and cost */}
        <Box marginTop={1} flexDirection="row" gap={2}>
          <Box>
            <Text dimColor>In: </Text>
            <Text>{formatTokens(llm.tokens.input)}</Text>
          </Box>
          <Box>
            <Text dimColor>Out: </Text>
            <Text>{formatTokens(llm.tokens.output)}</Text>
          </Box>
          {llm.tokens.reasoning > 0 && (
            <Box>
              <Text dimColor>Reasoning: </Text>
              <Text>{formatTokens(llm.tokens.reasoning)}</Text>
            </Box>
          )}
          {llm.cost > 0 && (
            <Box>
              <Text dimColor>Cost: </Text>
              <Text color="yellow">${llm.cost.toFixed(4)}</Text>
            </Box>
          )}
        </Box>
      </Box>
    </Panel>
  );
}

function formatTokens(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
