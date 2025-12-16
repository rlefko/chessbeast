/**
 * Evaluation Bar Component
 *
 * Visual representation of the engine evaluation.
 */

import { Box, Text } from 'ink';

export interface EvalBarProps {
  evaluation: { cp?: number | undefined; mate?: number | undefined };
  width?: number | undefined;
}

const BAR_WIDTH = 20;

export function EvalBar({ evaluation, width = BAR_WIDTH }: EvalBarProps): JSX.Element {
  const { cp, mate } = evaluation ?? {};

  // Calculate position (0-1, where 0.5 is equal)
  let position = 0.5;
  let label = '0.00';
  let color: string = 'white';

  if (mate !== undefined) {
    // Mate - show at extreme
    position = mate > 0 ? 1 : 0;
    label = mate > 0 ? `M${mate}` : `M${Math.abs(mate)}`;
    color = mate > 0 ? 'greenBright' : 'redBright';
  } else if (cp !== undefined) {
    // Convert centipawns to position using sigmoid
    // +300cp -> ~0.85, -300cp -> ~0.15
    const pawnValue = cp / 100;
    position = 1 / (1 + Math.exp(-pawnValue * 0.8));

    // Format label
    const sign = cp >= 0 ? '+' : '';
    label = `${sign}${(cp / 100).toFixed(2)}`;

    // Color based on advantage
    if (Math.abs(cp) < 25) {
      color = 'white';
    } else if (Math.abs(cp) < 150) {
      color = cp > 0 ? 'green' : 'red';
    } else {
      color = cp > 0 ? 'greenBright' : 'redBright';
    }
  }

  // Build the bar
  const filledCount = Math.round(position * width);
  const emptyCount = width - filledCount;

  const filled = '\u2588'.repeat(filledCount); // Full block
  const empty = '\u2591'.repeat(emptyCount); // Light shade

  return (
    <Box flexDirection="row" gap={1}>
      <Text color="white">{filled}</Text>
      <Text color="gray">{empty}</Text>
      <Text color={color} bold>
        {label}
      </Text>
    </Box>
  );
}

/**
 * Format evaluation for display
 */
export function formatEval(evaluation?: {
  cp?: number | undefined;
  mate?: number | undefined;
}): string {
  if (!evaluation) return '?';

  const { cp, mate } = evaluation;

  if (mate !== undefined) {
    return mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`;
  }

  if (cp !== undefined) {
    const sign = cp >= 0 ? '+' : '';
    return `${sign}${(cp / 100).toFixed(2)}`;
  }

  return '?';
}

/**
 * Get color for evaluation
 */
export function getEvalColor(evaluation?: {
  cp?: number | undefined;
  mate?: number | undefined;
}): string {
  if (!evaluation) return 'gray';

  const { cp, mate } = evaluation;

  if (mate !== undefined) {
    return mate > 0 ? 'greenBright' : 'redBright';
  }

  if (cp !== undefined) {
    const absCp = Math.abs(cp);
    if (absCp < 25) return 'white';
    if (absCp < 150) return cp > 0 ? 'green' : 'red';
    return cp > 0 ? 'greenBright' : 'redBright';
  }

  return 'gray';
}
