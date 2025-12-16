/**
 * Main Debug GUI Application
 *
 * Terminal-based 4-panel debug interface for Ultra-Fast Coach.
 */

import { Box, useApp, useStdout } from 'ink';
import { ChessBoardPanel } from './components/ChessBoardPanel.js';
import { LLMStreamPanel } from './components/LLMStreamPanel.js';
import { ToolCallsPanel } from './components/ToolCallsPanel.js';
import { EnginePanel } from './components/EnginePanel.js';
import { StatusBar } from './components/StatusBar.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useDebugStore } from './state/store.js';

export interface AppProps {
  url: string;
}

export function App({ url }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { ui } = useDebugStore();

  // Connect to WebSocket server
  useWebSocket({ url, autoConnect: true });

  // Set up keyboard handlers
  useKeyboard({ onQuit: exit });

  // Calculate panel dimensions based on terminal size
  const termWidth = stdout.columns || 120;
  const termHeight = stdout.rows || 40;

  // Reserve space for status bar (3 rows)
  const contentHeight = termHeight - 3;

  // 2x2 grid layout
  const panelWidth = Math.floor(termWidth / 2);
  const panelHeight = Math.floor(contentHeight / 2);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* Help overlay (modal) */}
      {ui.showHelp ? (
        <Box
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          height={contentHeight}
        >
          <HelpOverlay />
        </Box>
      ) : (
        /* Main content - 2x2 grid */
        <Box flexDirection="column" height={contentHeight}>
          {/* Top row */}
          <Box flexDirection="row">
            <ChessBoardPanel
              focused={ui.focusedPanel === 'board'}
              width={panelWidth}
              height={panelHeight}
            />
            <LLMStreamPanel
              focused={ui.focusedPanel === 'llm'}
              width={panelWidth}
              height={panelHeight}
            />
          </Box>

          {/* Bottom row */}
          <Box flexDirection="row">
            <ToolCallsPanel
              focused={ui.focusedPanel === 'tools'}
              width={panelWidth}
              height={panelHeight}
            />
            <EnginePanel
              focused={ui.focusedPanel === 'engine'}
              width={panelWidth}
              height={panelHeight}
            />
          </Box>
        </Box>
      )}

      {/* Status bar */}
      <StatusBar />
    </Box>
  );
}
