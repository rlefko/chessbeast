/**
 * Keyboard Input Hook
 *
 * Handles keyboard shortcuts for the Debug GUI.
 */

import { useInput } from 'ink';
import { useDebugStore } from '../state/store.js';

export interface UseKeyboardOptions {
  onQuit?: () => void;
}

export function useKeyboard({ onQuit }: UseKeyboardOptions = {}) {
  const {
    ui,
    focusNextPanel,
    focusPrevPanel,
    toggleHelp,
    togglePause,
    flipBoard,
    scrollLLM,
    toggleToolExpand,
    highlightPVLine,
    toolCalls,
  } = useDebugStore();

  useInput((input, key) => {
    // Global shortcuts (work regardless of focused panel)

    // Quit
    if (input === 'q' || (key.ctrl && input === 'c')) {
      onQuit?.();
      return;
    }

    // Tab - cycle panels
    if (key.tab) {
      if (key.shift) {
        focusPrevPanel();
      } else {
        focusNextPanel();
      }
      return;
    }

    // Help
    if (input === '?') {
      toggleHelp();
      return;
    }

    // Pause
    if (input === 'p') {
      togglePause();
      return;
    }

    // If help is showing, any key dismisses it (except the ones above)
    if (ui.showHelp) {
      toggleHelp();
      return;
    }

    // Panel-specific shortcuts
    switch (ui.focusedPanel) {
      case 'board':
        handleBoardInput(input, key);
        break;
      case 'llm':
        handleLLMInput(input, key);
        break;
      case 'tools':
        handleToolsInput(input, key);
        break;
      case 'engine':
        handleEngineInput(input, key);
        break;
    }
  });

  function handleBoardInput(input: string, _key: unknown) {
    // Flip board
    if (input === 'f') {
      flipBoard();
      return;
    }
  }

  function handleLLMInput(input: string, key: { upArrow?: boolean; downArrow?: boolean }) {
    // Scroll
    if (input === 'j' || key.downArrow) {
      scrollLLM(3);
      return;
    }
    if (input === 'k' || key.upArrow) {
      scrollLLM(-3);
      return;
    }
    // Scroll to top
    if (input === 'g') {
      scrollLLM(-1000);
      return;
    }
    // Scroll to bottom
    if (input === 'G') {
      scrollLLM(1000);
      return;
    }
  }

  function handleToolsInput(_input: string, key: { upArrow?: boolean; downArrow?: boolean; return?: boolean }) {
    // Get the last few tool calls for selection
    const recentCalls = toolCalls.slice(-10);

    // Toggle expand on Enter
    if (key.return && recentCalls.length > 0) {
      const lastCall = recentCalls[recentCalls.length - 1];
      if (lastCall) {
        toggleToolExpand(lastCall.id);
      }
      return;
    }
  }

  function handleEngineInput(input: string, _key: unknown) {
    // Highlight PV lines 1-3
    if (input === '1') {
      highlightPVLine(0);
      return;
    }
    if (input === '2') {
      highlightPVLine(1);
      return;
    }
    if (input === '3') {
      highlightPVLine(2);
      return;
    }
    // Clear highlight
    if (input === '0' || input === 'Escape') {
      highlightPVLine(null);
      return;
    }
  }
}
