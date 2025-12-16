/**
 * Tool Calls Panel
 *
 * Displays tool call history with arguments and results.
 */

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ReactNode } from 'react';

import { useDebugStore, type ToolCall } from '../state/store.js';

import { Panel } from './Panel.js';

export interface ToolCallsPanelProps {
  focused?: boolean | undefined;
  width?: string | number | undefined;
  height?: string | number | undefined;
  maxCalls?: number | undefined;
}

export function ToolCallsPanel({
  focused = false,
  width,
  height,
  maxCalls = 8,
}: ToolCallsPanelProps): JSX.Element {
  const { toolCalls } = useDebugStore();

  // Show most recent calls
  const recentCalls = toolCalls.slice(-maxCalls);

  return (
    <Panel title="Tool Calls" focused={focused} width={width} height={height}>
      <Box flexDirection="column">
        {recentCalls.length === 0 ? (
          <Text dimColor>No tool calls yet...</Text>
        ) : (
          recentCalls.map((call) => <ToolCallItem key={call.id} call={call} />)
        )}
      </Box>
    </Panel>
  );
}

interface ToolCallItemProps {
  call: ToolCall;
}

function ToolCallItem({ call }: ToolCallItemProps): JSX.Element {
  const statusColor = getStatusColor(call.status);
  const statusIcon = getStatusIcon(call.status);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header line */}
      <Box>
        <Text color={statusColor}>{statusIcon}</Text>
        <Text color="gray">
          {' '}
          [{call.iteration}/{call.maxIterations}]{' '}
        </Text>
        <Text bold color={call.status === 'running' ? 'yellow' : 'white'}>
          {call.toolName}
        </Text>
        {call.durationMs !== undefined && <Text dimColor> ({call.durationMs}ms)</Text>}
      </Box>

      {/* Arguments (abbreviated) */}
      <Box marginLeft={2}>
        <Text dimColor wrap="truncate">
          {formatToolArgs(call.toolName, call.toolArgs)}
        </Text>
      </Box>

      {/* Result or error */}
      {call.status === 'success' && call.result !== undefined && (
        <Box marginLeft={2}>
          <Text color="green" wrap="truncate">
            {formatToolResult(call.toolName, call.result)}
          </Text>
        </Box>
      )}

      {call.status === 'error' && call.error && (
        <Box marginLeft={2}>
          <Text color="red" wrap="truncate">
            Error: {call.error}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function getStatusColor(status: ToolCall['status']): string {
  switch (status) {
    case 'pending':
      return 'gray';
    case 'running':
      return 'yellow';
    case 'success':
      return 'green';
    case 'error':
      return 'red';
  }
}

function getStatusIcon(status: ToolCall['status']): ReactNode {
  switch (status) {
    case 'pending':
      return '\u25cb'; // Empty circle
    case 'running':
      return <Spinner type="dots" />;
    case 'success':
      return '\u2713'; // Checkmark
    case 'error':
      return '\u2717'; // X mark
  }
}

/**
 * Format tool arguments for display (chess-friendly)
 */
function formatToolArgs(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'evaluate_position':
    case 'EVALUATE_POSITION':
      return `depth ${args.depth ?? 16}, multipv ${args.multipv ?? 1}`;

    case 'predict_human_moves':
    case 'PREDICT_HUMAN_MOVES':
      return `rating ${args.rating ?? 1500}`;

    case 'push_move':
    case 'make_move':
    case 'MAKE_MOVE':
      return `${args.move || args.san || '?'}`;

    case 'lookup_opening':
    case 'LOOKUP_OPENING':
      return `${String(args.fen || '').slice(0, 40)}...`;

    case 'find_reference_games':
    case 'FIND_REFERENCE_GAMES':
      return `limit ${args.limit ?? 5}`;

    default: {
      // Generic JSON formatting (abbreviated)
      const json = JSON.stringify(args);
      return json.length > 50 ? json.slice(0, 47) + '...' : json;
    }
  }
}

/**
 * Format tool result for display (chess-friendly)
 */
function formatToolResult(toolName: string, result: unknown): string {
  if (result === null || result === undefined) return 'null';

  const r = result as Record<string, unknown>;

  switch (toolName) {
    case 'evaluate_position':
    case 'EVALUATE_POSITION':
      if (r.evaluation) {
        const ev = r.evaluation as { cp?: number; mate?: number };
        const evalStr =
          ev.mate !== undefined
            ? `M${ev.mate}`
            : ev.cp !== undefined
              ? `${ev.cp >= 0 ? '+' : ''}${(ev.cp / 100).toFixed(2)}`
              : '?';
        const pv = r.pv as string[] | undefined;
        const pvStr = pv ? pv.slice(0, 3).join(' ') : '';
        return `${evalStr} ${pvStr}`;
      }
      return JSON.stringify(result).slice(0, 50);

    case 'predict_human_moves':
    case 'PREDICT_HUMAN_MOVES':
      if (Array.isArray(r.predictions)) {
        const preds = r.predictions as Array<{ move: string; probability: number }>;
        return preds
          .slice(0, 3)
          .map((p) => `${p.move} (${Math.round(p.probability * 100)}%)`)
          .join(' ');
      }
      return JSON.stringify(result).slice(0, 50);

    case 'push_move':
    case 'make_move':
    case 'MAKE_MOVE':
      if (r.success !== undefined) {
        const check = r.isCheck ? '+' : '';
        const capture = r.isCapture ? 'x' : '';
        return `${r.success ? 'OK' : 'FAIL'}${check}${capture}`;
      }
      return JSON.stringify(result).slice(0, 50);

    case 'lookup_opening':
    case 'LOOKUP_OPENING':
      if (r.name) {
        return String(r.name);
      }
      return r.found === false ? 'Not found' : JSON.stringify(result).slice(0, 50);

    default: {
      const json = JSON.stringify(result);
      return json.length > 60 ? json.slice(0, 57) + '...' : json;
    }
  }
}
