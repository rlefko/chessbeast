/**
 * Status Bar Component
 *
 * Displays connection status, session/phase progress with elapsed time,
 * an end-of-session summary chip, and keyboard hints (collapsed when narrow).
 */

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useEffect, useState } from 'react';

import { MAX_RECONNECT_ATTEMPTS } from '../hooks/backoff.js';
import { useDebugStore, type ConnectionState } from '../state/store.js';
import { palette } from '../theme.js';

export interface StatusBarProps {
  width?: number | undefined;
}

/** Below this width, keyboard hints collapse to "?: help" */
const NARROW_WIDTH = 100;

export function StatusBar({ width }: StatusBarProps): JSX.Element {
  const connection = useDebugStore((state) => state.connection);
  const session = useDebugStore((state) => state.session);
  const phase = useDebugStore((state) => state.phase);
  const ui = useDebugStore((state) => state.ui);

  // Tick once per second while a phase is running so elapsed time updates
  const phaseActive = phase !== null && session.active;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!phaseActive) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return (): void => clearInterval(interval);
  }, [phaseActive]);

  const narrow = (width ?? 120) < NARROW_WIDTH;
  const showSummaryChip = !session.active && session.stats !== undefined;

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      {/* Left side: Connection status + progress */}
      <Box>
        <ConnectionStatus connection={connection} />

        {session.active && session.gameMetadata && !narrow && (
          <Text dimColor>
            {' '}
            | {session.gameMetadata.white} vs {session.gameMetadata.black}
          </Text>
        )}

        {phase && session.active && (
          <Text dimColor>
            {' '}
            | {phase.name}: {phase.progress}/{phase.total}
            {phase.startTime > 0 && ` (${formatElapsed(now - phase.startTime)})`}
          </Text>
        )}

        {showSummaryChip && session.stats && (
          <Text>
            {' '}
            <Text color={palette.success}>✓ {session.stats.annotationsGenerated} comments</Text>
            {session.stats.nodesExplored !== undefined && (
              <Text dimColor> · {session.stats.nodesExplored} nodes</Text>
            )}
            {session.stats.totalTimeMs > 0 && (
              <Text dimColor> · {formatElapsed(session.stats.totalTimeMs)}</Text>
            )}
          </Text>
        )}
      </Box>

      {/* Right side: Shortcuts and status */}
      <Box>
        {ui.paused && (
          <Text color={palette.warning} bold>
            PAUSED{' '}
          </Text>
        )}
        {narrow ? (
          <Text dimColor>?: help</Text>
        ) : (
          <Text dimColor>Tab: panels | ?: help | p: pause | f: flip | q: quit</Text>
        )}
      </Box>
    </Box>
  );
}

interface ConnectionStatusProps {
  connection: ConnectionState;
}

function ConnectionStatus({ connection }: ConnectionStatusProps): JSX.Element {
  switch (connection.status) {
    case 'connecting':
      return (
        <Text color={palette.warning}>
          <Spinner type="dots" /> Connecting
          {connection.reconnectAttempts > 0 &&
            ` (attempt ${connection.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`}
          …
        </Text>
      );
    case 'connected':
      return <Text color={palette.success}>[Connected]</Text>;
    case 'disconnected':
      return <Text color={palette.muted}>[Disconnected]</Text>;
    case 'ended':
      return <Text color={palette.accent}>[Session ended]</Text>;
    case 'error':
      return <Text color={palette.danger}>[Error: {connection.error ?? 'Unknown'}]</Text>;
  }
}

/**
 * Format a millisecond duration as "SSs" or "MmSSs"
 */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m${seconds.toString().padStart(2, '0')}s`;
}
