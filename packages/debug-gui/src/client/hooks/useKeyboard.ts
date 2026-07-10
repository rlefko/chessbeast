/**
 * Keyboard Input Hook
 *
 * Handles keyboard shortcuts for the Debug GUI.
 */

import { useInput } from 'ink';

import { useDebugStore, LLM_SCROLL_MAX } from '../state/store.js';

export interface UseKeyboardOptions {
  onQuit?: () => void;
}

/** How many lines a single scroll keypress moves */
const SCROLL_STEP = 3;

export function useKeyboard({ onQuit }: UseKeyboardOptions = {}): void {
  const ui = useDebugStore((state) => state.ui);
  const focusNextPanel = useDebugStore((state) => state.focusNextPanel);
  const focusPrevPanel = useDebugStore((state) => state.focusPrevPanel);
  const toggleHelp = useDebugStore((state) => state.toggleHelp);
  const togglePause = useDebugStore((state) => state.togglePause);
  const flipBoard = useDebugStore((state) => state.flipBoard);
  const scrollLLM = useDebugStore((state) => state.scrollLLM);
  const followLLM = useDebugStore((state) => state.followLLM);
  const highlightPVLine = useDebugStore((state) => state.highlightPVLine);

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
        handleBoardInput(input);
        break;
      case 'llm':
        handleLLMInput(input, key);
        break;
      case 'annotations':
        // The annotation queue auto-follows narration progress (no bindings)
        break;
      case 'engine':
        handleEngineInput(input);
        break;
    }
  });

  function handleBoardInput(input: string): void {
    // Flip board
    if (input === 'f') {
      flipBoard();
      return;
    }
  }

  function handleLLMInput(input: string, key: { upArrow?: boolean; downArrow?: boolean }): void {
    // Scroll offset is measured from the tail: 0 = follow live output.
    // Down (j) moves toward the tail, up (k) moves toward older text.
    if (input === 'j' || key.downArrow) {
      scrollLLM(-SCROLL_STEP);
      return;
    }
    if (input === 'k' || key.upArrow) {
      scrollLLM(SCROLL_STEP);
      return;
    }
    // Jump to oldest text
    if (input === 'g') {
      scrollLLM(LLM_SCROLL_MAX);
      return;
    }
    // Resume tail-following
    if (input === 'G') {
      followLLM();
      return;
    }
  }

  function handleEngineInput(input: string): void {
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
    if (input === '0') {
      highlightPVLine(null);
      return;
    }
  }
}
