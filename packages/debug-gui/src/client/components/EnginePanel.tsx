/**
 * Engine Analysis Panel
 *
 * Displays engine analysis details, PV lines, exploration progress, and themes.
 */

import { Box, Text } from 'ink';

import { useDebugStore } from '../state/store.js';
import { getEvalColor, getLifecycleColor, getLifecycleIcon, palette } from '../theme.js';

import { formatEval } from './EvalBar.js';
import { Panel } from './Panel.js';

export interface EnginePanelProps {
  focused?: boolean | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

export function EnginePanel({ focused = false, width, height }: EnginePanelProps): JSX.Element {
  const engine = useDebugStore((state) => state.engine);
  const exploration = useDebugStore((state) => state.exploration);
  const themes = useDebugStore((state) => state.themes);
  const criticalMoments = useDebugStore((state) => state.criticalMoments);

  const hasAnyData =
    engine.hasData || exploration !== null || themes.length > 0 || criticalMoments.length > 0;

  return (
    <Panel title="Engine" focused={focused} width={width} height={height}>
      <Box flexDirection="column">
        {!hasAnyData && (
          <Box flexDirection="column">
            <Text dimColor>Waiting for engine data —</Text>
            <Text dimColor>exploration starts at the first critical moment.</Text>
          </Box>
        )}

        {/* Analysis stats */}
        {engine.hasData && (
          <Box>
            <Text dimColor>Depth: </Text>
            <Text bold>{engine.depth}</Text>
            {engine.nodes > 0 && (
              <>
                <Text dimColor> | Nodes: </Text>
                <Text>{formatNodes(engine.nodes)}</Text>
              </>
            )}
            {engine.nps > 0 && (
              <>
                <Text dimColor> | </Text>
                <Text>{formatNodes(engine.nps)}/s</Text>
              </>
            )}
          </Box>
        )}

        {/* Main PV line */}
        {engine.pv.length > 0 && (
          <Box>
            <Text color={getEvalColor(engine.evaluation)} bold>
              {formatEval(engine.evaluation)}
            </Text>
            <Text> {engine.pv.slice(0, 6).join(' ')}</Text>
            {engine.pv.length > 6 && <Text dimColor>...</Text>}
          </Box>
        )}

        {/* MultiPV alternatives */}
        {engine.multipv.length > 1 && (
          <Box flexDirection="column">
            <Text dimColor>Alternatives:</Text>
            {engine.multipv.slice(1, 4).map((line, idx) => (
              <Box key={idx} marginLeft={1}>
                <Text
                  color={engine.highlightedLine === idx + 1 ? palette.accentBright : palette.muted}
                >
                  {idx + 2}.{' '}
                </Text>
                <Text color={getEvalColor(line.evaluation)}>{formatEval(line.evaluation)}</Text>
                <Text> {line.move}</Text>
                {line.pv.length > 1 && <Text dimColor> {line.pv.slice(1, 4).join(' ')}</Text>}
              </Box>
            ))}
          </Box>
        )}

        {/* Exploration progress */}
        {exploration && (
          <Box flexDirection="column" marginTop={engine.hasData ? 1 : 0}>
            <Box>
              <Text dimColor>Exploration: </Text>
              <Text>
                {exploration.nodesExplored}/{exploration.maxNodes}
              </Text>
              <Text dimColor> nodes | depth </Text>
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
          <Box flexDirection="column" marginTop={1}>
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
          <Box marginTop={1}>
            <Text dimColor>Critical Moments: </Text>
            <Text color={palette.warning} bold>
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

function ProgressBar({ current, total, width = 20 }: ProgressBarProps): JSX.Element {
  const percentage = total > 0 ? Math.min(1, current / total) : 0;
  const filled = Math.round(percentage * width);
  const empty = width - filled;

  return (
    <Text>
      <Text color={palette.success}>{'█'.repeat(filled)}</Text>
      <Text color={palette.muted}>{'░'.repeat(empty)}</Text>
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
