/**
 * Evaluation Bar Component
 *
 * Visual representation of the engine evaluation. The filled segment shows
 * White's share and is colored by who is better; a midpoint marker shows the
 * equality line. Non-mate evaluations are clamped so both sides stay visible.
 */

import { Box, Text } from 'ink';

import { getEvalColor, palette } from '../theme.js';

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

  if (mate !== undefined) {
    // Mate - show at extreme (the only case where a side may fully vanish)
    position = mate > 0 ? 1 : 0;
    label = mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`;
  } else if (cp !== undefined) {
    // Convert centipawns to position using sigmoid
    // +300cp -> ~0.85, -300cp -> ~0.15
    const pawnValue = cp / 100;
    position = 1 / (1 + Math.exp(-pawnValue * 0.8));

    // Format label
    const sign = cp >= 0 ? '+' : '';
    label = `${sign}${(cp / 100).toFixed(2)}`;
  }

  // Build the bar; clamp so both sides remain visible except for mate
  let filledCount = Math.round(position * width);
  if (mate === undefined) {
    filledCount = Math.max(1, Math.min(width - 1, filledCount));
  }

  const advantageColor = getEvalColor(evaluation);
  const mid = Math.floor(width / 2);

  // Split the bar around the midpoint marker
  const fillBeforeMid = Math.min(filledCount, mid);
  const emptyBeforeMid = mid - fillBeforeMid;
  const fillAfterMid = Math.max(0, filledCount - (mid + 1));
  const emptyAfterMid = Math.max(0, width - (mid + 1) - fillAfterMid);
  const midIsFilled = filledCount > mid;

  return (
    <Box flexDirection="row" gap={1}>
      <Text>
        <Text color={advantageColor}>{'█'.repeat(fillBeforeMid)}</Text>
        <Text color={palette.muted}>{'░'.repeat(emptyBeforeMid)}</Text>
        <Text color={midIsFilled ? advantageColor : palette.muted}>{'┼'}</Text>
        <Text color={advantageColor}>{'█'.repeat(fillAfterMid)}</Text>
        <Text color={palette.muted}>{'░'.repeat(emptyAfterMid)}</Text>
      </Text>
      <Text color={advantageColor} bold>
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
