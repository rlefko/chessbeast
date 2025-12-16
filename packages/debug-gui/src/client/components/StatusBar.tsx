/**
 * Status Bar Component
 *
 * Displays connection status, progress info, and keyboard shortcuts.
 */

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

import { useDebugStore } from '../state/store.js';

export function StatusBar(): JSX.Element {
  const { connection, session, phase, ui } = useDebugStore();

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      {/* Left side: Connection status */}
      <Box>
        <ConnectionStatus status={connection.status} error={connection.error} />

        {session.active && session.gameMetadata && (
          <Text dimColor>
            {' '}
            | {session.gameMetadata.white} vs {session.gameMetadata.black}
          </Text>
        )}

        {phase && (
          <Text dimColor>
            {' '}
            | {phase.name}: {phase.progress}/{phase.total}
          </Text>
        )}
      </Box>

      {/* Right side: Shortcuts and status */}
      <Box>
        {ui.paused && (
          <Text color="yellow" bold>
            PAUSED{' '}
          </Text>
        )}
        <Text dimColor>Tab: panels | ?: help | f: flip | q: quit</Text>
      </Box>
    </Box>
  );
}

interface ConnectionStatusProps {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string | undefined;
}

function ConnectionStatus({ status, error }: ConnectionStatusProps): JSX.Element {
  switch (status) {
    case 'connecting':
      return (
        <Text color="yellow">
          <Spinner type="dots" /> Connecting...
        </Text>
      );
    case 'connected':
      return <Text color="green">[Connected]</Text>;
    case 'disconnected':
      return <Text color="gray">[Disconnected]</Text>;
    case 'error':
      return <Text color="red">[Error: {error ?? 'Unknown'}]</Text>;
  }
}
