/**
 * LLM Stream Panel
 *
 * Displays real-time LLM output with tail-following: the panel always shows
 * the LAST lines that fit, so long thinking streams stay readable. j/k/g/G
 * adjust the scroll offset (measured from the tail; 0 = following).
 */

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

import { useDebugStore } from '../state/store.js';
import { palette } from '../theme.js';

import { Panel } from './Panel.js';

export interface LLMStreamPanelProps {
  focused?: boolean | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

/** Rows consumed by border + title */
const PANEL_CHROME_ROWS = 3;

/** Rows consumed by header, scroll marker, and totals footer */
const FIXED_ROWS = 3;

interface DisplayLine {
  text: string;
  kind: 'thinking-label' | 'thinking' | 'comment-label' | 'comment';
}

export function LLMStreamPanel({
  focused = false,
  width,
  height,
}: LLMStreamPanelProps): JSX.Element {
  const llm = useDebugStore((state) => state.llm);

  const innerWidth = Math.max(20, (width ?? 60) - 4);
  const bodyHeight = Math.max(3, (height ?? 20) - PANEL_CHROME_ROWS - FIXED_ROWS);

  // Build the full line list (thinking block, then comment block)
  const lines: DisplayLine[] = [];
  if (llm.reasoning) {
    lines.push({ text: '[thinking]', kind: 'thinking-label' });
    for (const line of wrapText(llm.reasoning, innerWidth - 2)) {
      lines.push({ text: line, kind: 'thinking' });
    }
  }
  if (llm.content) {
    lines.push({ text: llm.isStreaming ? '… comment' : '✓ comment', kind: 'comment-label' });
    for (const line of wrapText(llm.content, innerWidth - 2)) {
      lines.push({ text: line, kind: 'comment' });
    }
  }

  // Tail-follow with offset-from-tail scrolling
  const maxOffset = Math.max(0, lines.length - bodyHeight);
  const offset = Math.min(llm.scrollOffset, maxOffset);
  const start = Math.max(0, lines.length - bodyHeight - offset);
  const visible = lines.slice(start, start + bodyHeight);
  const following = offset === 0;

  return (
    <Panel title="LLM Stream" focused={focused} width={width} height={height}>
      <Box flexDirection="column">
        {/* Header: {move} · {intentType} · {model} */}
        <Box>
          {llm.currentMove || llm.model ? (
            <Text wrap="truncate">
              <Text bold color={palette.accent}>
                {llm.currentMove || '—'}
              </Text>
              {llm.intentType && <Text dimColor> · {llm.intentType}</Text>}
              {llm.model && <Text dimColor> · {llm.model}</Text>}
              {llm.isStreaming && (
                <Text color={palette.warning}>
                  {' '}
                  <Spinner type="dots" />
                  {llm.isThinking ? ' thinking' : ' writing'}
                </Text>
              )}
            </Text>
          ) : (
            <Text dimColor>Waiting for LLM stream…</Text>
          )}
        </Box>

        {/* Body: tail-followed stream text */}
        <Box flexDirection="column" height={bodyHeight}>
          {visible.map((line, idx) => (
            <LineView key={`${start + idx}`} line={line} />
          ))}
        </Box>

        {/* Scroll marker */}
        <Box>
          {following ? (
            <Text dimColor>▼ following</Text>
          ) : (
            <Text color={palette.warning}>↑ scrolled (G to follow)</Text>
          )}
        </Box>

        {/* Token usage and session totals */}
        <Box>
          <Text wrap="truncate">
            <Text dimColor>In </Text>
            <Text>{formatTokens(llm.lastTokens.input)}</Text>
            <Text dimColor> · Out </Text>
            <Text>{formatTokens(llm.lastTokens.output)}</Text>
            {llm.lastTokens.reasoning > 0 && (
              <>
                <Text dimColor> · Think </Text>
                <Text>{formatTokens(llm.lastTokens.reasoning)}</Text>
              </>
            )}
            {llm.lastCost > 0 && <Text color={palette.cost}> · ${formatCost(llm.lastCost)}</Text>}
            <Text dimColor>
              {'  |  Σ '}
              {llm.totals.streams} streams · {formatTokens(totalTokens(llm.totals))} tok
            </Text>
            {llm.totals.cost > 0 && (
              <Text color={palette.cost}> · ${formatCost(llm.totals.cost)}</Text>
            )}
          </Text>
        </Box>
      </Box>
    </Panel>
  );
}

function LineView({ line }: { line: DisplayLine }): JSX.Element {
  switch (line.kind) {
    case 'thinking-label':
      return <Text dimColor>{line.text}</Text>;
    case 'thinking':
      return (
        <Text color={palette.thinking} dimColor italic>
          ▏ {line.text}
        </Text>
      );
    case 'comment-label':
      return <Text color={palette.success}>{line.text}</Text>;
    case 'comment':
      return <Text color={palette.comment}> {line.text}</Text>;
  }
}

function totalTokens(totals: { input: number; output: number; reasoning: number }): number {
  return totals.input + totals.output + totals.reasoning;
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

function formatCost(cost: number): string {
  return cost >= 0.1 ? cost.toFixed(2) : cost.toFixed(4);
}

/**
 * Word-wrap text to a given width, preserving explicit newlines.
 * Words longer than the width are hard-split.
 */
export function wrapText(text: string, width: number): string[] {
  const safeWidth = Math.max(1, width);
  const result: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (paragraph.length === 0) {
      result.push('');
      continue;
    }

    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      if (word.length === 0) continue;

      if (current.length === 0) {
        current = word;
      } else if (current.length + 1 + word.length <= safeWidth) {
        current += ` ${word}`;
      } else {
        result.push(current);
        current = word;
      }

      // Hard-split words that exceed the width on their own
      while (current.length > safeWidth) {
        result.push(current.slice(0, safeWidth));
        current = current.slice(safeWidth);
      }
    }
    if (current.length > 0) {
      result.push(current);
    }
  }

  return result;
}
