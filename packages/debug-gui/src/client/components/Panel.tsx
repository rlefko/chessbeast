/**
 * Panel Component
 *
 * A bordered panel with a title, used for each section of the debug GUI.
 */

import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

export interface PanelProps {
  title: string;
  focused: boolean;
  children: ReactNode;
  width?: string | number | undefined;
  height?: string | number | undefined;
}

export function Panel({
  title,
  focused = false,
  children,
  width,
  height,
}: PanelProps): JSX.Element {
  const borderColor = focused ? 'cyan' : 'gray';
  const titleColor = focused ? 'cyanBright' : 'white';

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      width={width}
      height={height}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text color={titleColor} bold={focused}>
          {title}
        </Text>
        {focused && (
          <Text color="gray" dimColor>
            {' '}
            (focused)
          </Text>
        )}
      </Box>
      {children}
    </Box>
  );
}
