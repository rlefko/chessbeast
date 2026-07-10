/**
 * Help Overlay Component
 *
 * Modal showing all keyboard shortcuts.
 */

import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { palette } from '../theme.js';

export interface HelpOverlayProps {
  onClose?: (() => void) | undefined;
}

export function HelpOverlay({ onClose: _onClose }: HelpOverlayProps): JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" paddingX={2} paddingY={1}>
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={palette.accentBright}>
          Debug GUI Keyboard Shortcuts
        </Text>
      </Box>

      <Section title="Global">
        <Shortcut keys="Tab" description="Focus next panel" />
        <Shortcut keys="Shift+Tab" description="Focus previous panel" />
        <Shortcut keys="?" description="Toggle this help" />
        <Shortcut keys="p" description="Pause (events buffer and replay on resume)" />
        <Shortcut keys="q / Ctrl+C" description="Quit" />
      </Section>

      <Section title="Chess Board Panel">
        <Shortcut keys="f" description="Flip board perspective" />
      </Section>

      <Section title="LLM Stream Panel">
        <Shortcut keys="j / Down" description="Scroll toward newest text" />
        <Shortcut keys="k / Up" description="Scroll toward oldest text" />
        <Shortcut keys="g" description="Jump to oldest text" />
        <Shortcut keys="G" description="Follow live output" />
      </Section>

      <Section title="Engine Panel">
        <Shortcut keys="1/2/3" description="Highlight PV line 1/2/3" />
        <Shortcut keys="0" description="Clear highlight" />
      </Section>

      <Box marginTop={1} justifyContent="center">
        <Text dimColor>Press any key to close</Text>
      </Box>
    </Box>
  );
}

interface SectionProps {
  title: string;
  children: ReactNode;
}

function Section({ title, children }: SectionProps): JSX.Element {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={palette.accent}>
        {title}
      </Text>
      <Box flexDirection="column" marginLeft={2}>
        {children}
      </Box>
    </Box>
  );
}

interface ShortcutProps {
  keys: string;
  description: string;
}

function Shortcut({ keys, description }: ShortcutProps): JSX.Element {
  return (
    <Box>
      <Box width={15}>
        <Text color={palette.warning}>{keys}</Text>
      </Box>
      <Text dimColor>{description}</Text>
    </Box>
  );
}
