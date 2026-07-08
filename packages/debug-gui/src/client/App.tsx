/**
 * Main Debug GUI Application
 *
 * Terminal-based 4-panel debug interface for Ultra-Fast Coach.
 *
 * Layout: fixed-width left column (chess board on top, engine below); the
 * right column takes the remaining width (LLM stream on top, annotation
 * queue below). Terminal resizes re-flow the grid; very small terminals get
 * a guard message instead of a corrupted grid.
 */

import { Box, Text, useApp } from 'ink';

import { AnnotationPanel } from './components/AnnotationPanel.js';
import { ChessBoardPanel } from './components/ChessBoardPanel.js';
import { EnginePanel } from './components/EnginePanel.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { LLMStreamPanel } from './components/LLMStreamPanel.js';
import { StatusBar } from './components/StatusBar.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useStdoutDimensions } from './hooks/useStdoutDimensions.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useDebugStore } from './state/store.js';
import { palette } from './theme.js';

export interface AppProps {
  url: string;
}

/** Minimum terminal size for the panel grid */
const MIN_WIDTH = 80;
const MIN_HEIGHT = 24;

/** Fixed width of the left column (board + engine) */
const LEFT_COLUMN_WIDTH = 42;

/** Rows reserved for the status bar */
const STATUS_BAR_ROWS = 3;

export function App({ url }: AppProps): JSX.Element {
  const { exit } = useApp();
  const ui = useDebugStore((state) => state.ui);
  const { width, height } = useStdoutDimensions();

  // Connect to WebSocket server
  useWebSocket({ url, autoConnect: true });

  // Set up keyboard handlers
  useKeyboard({ onQuit: exit });

  // Guard tiny terminals instead of rendering a corrupted grid
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={palette.warning} bold>
          Terminal too small
        </Text>
        <Text dimColor>
          The Debug GUI needs at least {MIN_WIDTH}x{MIN_HEIGHT} (current: {width}x{height}).
        </Text>
        <Text dimColor>Resize the terminal, or press q to quit.</Text>
      </Box>
    );
  }

  const contentHeight = height - STATUS_BAR_ROWS;
  const rightColumnWidth = width - LEFT_COLUMN_WIDTH;

  // Left column: board panel gets its natural height, engine takes the rest
  const boardHeight = Math.min(21, Math.max(13, contentHeight - 8));
  const engineHeight = contentHeight - boardHeight;

  // Right column: LLM stream gets the larger share
  const llmHeight = Math.max(9, Math.ceil(contentHeight * 0.55));
  const annotationsHeight = contentHeight - llmHeight;

  return (
    <Box flexDirection="column" width={width} height={height}>
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
        /* Main content: asymmetric two-column grid */
        <Box flexDirection="row" height={contentHeight}>
          {/* Left column (fixed width) */}
          <Box flexDirection="column" width={LEFT_COLUMN_WIDTH}>
            <ChessBoardPanel
              focused={ui.focusedPanel === 'board'}
              width={LEFT_COLUMN_WIDTH}
              height={boardHeight}
            />
            <EnginePanel
              focused={ui.focusedPanel === 'engine'}
              width={LEFT_COLUMN_WIDTH}
              height={engineHeight}
            />
          </Box>

          {/* Right column (remaining width) */}
          <Box flexDirection="column" width={rightColumnWidth}>
            <LLMStreamPanel
              focused={ui.focusedPanel === 'llm'}
              width={rightColumnWidth}
              height={llmHeight}
            />
            <AnnotationPanel
              focused={ui.focusedPanel === 'annotations'}
              width={rightColumnWidth}
              height={annotationsHeight}
            />
          </Box>
        </Box>
      )}

      {/* Status bar */}
      <StatusBar width={width} />
    </Box>
  );
}
