/**
 * Engine Analysis Panel
 *
 * Displays engine analysis details, PV lines, exploration progress, and themes.
 */

import { Box, Text } from 'ink';
import { Panel } from './Panel.js';
import { formatEval, getEvalColor } from './EvalBar.js';
import { useDebugStore } from '../state/store.js';

export interface EnginePanelProps {
  focused?: boolean | undefined;
  width?: string | number | undefined;
  height?: string | number | undefined;
}

export function EnginePanel({ focused = false, width, height }: EnginePanelProps) {
  const { engine, exploration, themes, criticalMoments } = useDebugStore();

  return (
    <Panel title="Engine Analysis" focused={focused} width={width} height={height}>
      <Box flexDirection="column">
        {/* Analysis stats */}
        <Box marginBottom={1}>
          <Text dimColor>Depth: </Text>
          <Text bold>{engine.depth}</Text>
          <Text dimColor> | Nodes: </Text>
          <Text>{formatNodes(engine.nodes)}</Text>
          {engine.nps > 0 && (
            <>
              <Text dimColor> | </Text>
              <Text>{formatNodes(engine.nps)}/s</Text>
            </>
          )}
        </Box>

        {/* Main PV line */}
        {engine.pv.length > 0 && (
          <Box marginBottom={1}>
            <Text color={getEvalColor(engine.evaluation)} bold>
              {formatEval(engine.evaluation)}
            </Text>
            <Text> {engine.pv.slice(0, 6).join(' ')}</Text>
            {engine.pv.length > 6 && <Text dimColor>...</Text>}
          </Box>
        )}

        {/* MultiPV alternatives */}
        {engine.multipv.length > 1 && (
          <Box flexDirection="column" marginBottom={1}>
            <Text dimColor>Alternatives:</Text>
            {engine.multipv.slice(1, 4).map((line, idx) => (
              <Box key={idx} marginLeft={1}>
                <Text color="gray">{idx + 2}. </Text>
                <Text color={getEvalColor(line.evaluation)}>
                  {formatEval(line.evaluation)}
                </Text>
                <Text> {line.move}</Text>
                {line.pv.length > 1 && (
                  <Text dimColor> {line.pv.slice(1, 4).join(' ')}</Text>
                )}
              </Box>
            ))}
          </Box>
        )}

        {/* Exploration progress */}
        {exploration && (
          <Box flexDirection="column" marginBottom={1}>
            <Text dimColor>Exploration:</Text>
            <Box marginLeft={1}>
              <Text>
                Nodes: {exploration.nodesExplored}/{exploration.maxNodes}
              </Text>
              <Text dimColor> | Depth: </Text>
              <Text>{exploration.currentDepth}</Text>
            </Box>
            <Box marginLeft={1}>
              <ProgressBar
                current={exploration.nodesExplored}
                total={exploration.maxNodes}
                width={20}
              />
              <Text dimColor> {exploration.phase}</Text>
            </Box>
            {(exploration.themesDetected > 0 || exploration.intentsGenerated > 0) && (
              <Box marginLeft={1}>
                <Text dimColor>Themes: </Text>
                <Text>{exploration.themesDetected}</Text>
                <Text dimColor> | Intents: </Text>
                <Text>{exploration.intentsGenerated}</Text>
              </Box>
            )}
          </Box>
        )}

        {/* Recent themes */}
        {themes.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            <Text dimColor>Themes:</Text>
            {themes.slice(-4).map((theme, idx) => (
              <Box key={idx} marginLeft={1}>
                <Text color={getLifecycleColor(theme.lifecycle)}>
                  {getLifecycleIcon(theme.lifecycle)}
                </Text>
                <Text> {theme.name}</Text>
              </Box>
            ))}
          </Box>
        )}

        {/* Critical moments count */}
        {criticalMoments.length > 0 && (
          <Box>
            <Text dimColor>Critical Moments: </Text>
            <Text color="yellow" bold>
              {criticalMoments.length}
            </Text>
          </Box>
        )}
      </Box>
    </Panel>
  );
}

interface ProgressBarProps {
  current: number;
  total: number;
  width?: number;
}

function ProgressBar({ current, total, width = 20 }: ProgressBarProps) {
  const percentage = total > 0 ? current / total : 0;
  const filled = Math.round(percentage * width);
  const empty = width - filled;

  return (
    <Text>
      <Text color="green">{'\u2588'.repeat(filled)}</Text>
      <Text color="gray">{'\u2591'.repeat(empty)}</Text>
    </Text>
  );
}

function formatNodes(nodes: number): string {
  if (nodes >= 1000000000) {
    return `${(nodes / 1000000000).toFixed(1)}B`;
  }
  if (nodes >= 1000000) {
    return `${(nodes / 1000000).toFixed(1)}M`;
  }
  if (nodes >= 1000) {
    return `${(nodes / 1000).toFixed(1)}K`;
  }
  return nodes.toString();
}

function getLifecycleColor(lifecycle: string): string {
  switch (lifecycle) {
    case 'emerged':
      return 'greenBright';
    case 'persisting':
      return 'cyan';
    case 'escalated':
      return 'yellowBright';
    case 'resolved':
      return 'gray';
    default:
      return 'white';
  }
}

function getLifecycleIcon(lifecycle: string): string {
  switch (lifecycle) {
    case 'emerged':
      return '[NEW]';
    case 'persisting':
      return '[+]';
    case 'escalated':
      return '[!]';
    case 'resolved':
      return '[-]';
    default:
      return '[?]';
  }
}
