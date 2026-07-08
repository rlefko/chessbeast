/**
 * Terminal Dimensions Hook
 *
 * Tracks the stdout size and re-renders on terminal resize.
 */

import { useStdout } from 'ink';
import { useEffect, useState } from 'react';

export interface StdoutDimensions {
  width: number;
  height: number;
}

const DEFAULT_WIDTH = 120;
const DEFAULT_HEIGHT = 40;

export function useStdoutDimensions(): StdoutDimensions {
  const { stdout } = useStdout();

  const [size, setSize] = useState<StdoutDimensions>({
    width: stdout?.columns ?? DEFAULT_WIDTH,
    height: stdout?.rows ?? DEFAULT_HEIGHT,
  });

  useEffect(() => {
    if (!stdout) return;

    const onResize = (): void => {
      setSize({
        width: stdout.columns ?? DEFAULT_WIDTH,
        height: stdout.rows ?? DEFAULT_HEIGHT,
      });
    };

    onResize();
    stdout.on('resize', onResize);
    return (): void => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  return size;
}
