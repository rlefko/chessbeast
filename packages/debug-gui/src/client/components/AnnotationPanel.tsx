/**
 * Annotation Panel
 *
 * Shows the comment-intent queue produced by engine exploration and tracks
 * each intent as it transitions pending → done (comment generated) or
 * pending → filtered (dropped by density/redundancy/cap).
 */

import { Box, Text } from 'ink';

import { useDebugStore, type AnnotationItem } from '../state/store.js';
import {
  getAnnotationStatusColor,
  getAnnotationStatusIcon,
  getIntentColor,
  getIntentIcon,
  palette,
} from '../theme.js';

import { Panel } from './Panel.js';

export interface AnnotationPanelProps {
  focused?: boolean | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

/** Rows consumed by the panel border + title + summary line */
const PANEL_CHROME_ROWS = 4;

export function AnnotationPanel({
  focused = false,
  width,
  height,
}: AnnotationPanelProps): JSX.Element {
  const annotations = useDebugStore((state) => state.annotations);

  const sorted = [...annotations].sort((a, b) => a.plyIndex - b.plyIndex);
  const doneCount = sorted.filter((a) => a.status === 'done').length;
  const filteredCount = sorted.filter((a) => a.status === 'filtered').length;
  const pendingCount = sorted.length - doneCount - filteredCount;

  // Each item renders 1 line (+1 comment line when done)
  const innerHeight = Math.max(3, (height ?? 20) - PANEL_CHROME_ROWS);
  const visible = selectVisibleWindow(sorted, innerHeight);

  return (
    <Panel title="Annotations" focused={focused} width={width} height={height}>
      <Box flexDirection="column">
        {sorted.length === 0 ? (
          <Text dimColor>No annotation intents yet — the queue fills after exploration.</Text>
        ) : (
          <>
            <Box>
              <Text dimColor>
                {doneCount}/{sorted.length} written
              </Text>
              {pendingCount > 0 && <Text color={palette.warning}> · {pendingCount} pending</Text>}
              {filteredCount > 0 && <Text dimColor> · {filteredCount} filtered</Text>}
            </Box>
            {visible.map((item) => (
              <AnnotationRow key={item.plyIndex} item={item} width={width} />
            ))}
          </>
        )}
      </Box>
    </Panel>
  );
}

/**
 * Pick the window of items to display: centered on the narration frontier
 * (first pending item), falling back to the tail when everything is settled.
 */
function selectVisibleWindow(items: AnnotationItem[], maxLines: number): AnnotationItem[] {
  // Estimate line usage: done items take 2 lines (row + comment)
  const lineCost = (item: AnnotationItem): number => (item.status === 'done' ? 2 : 1);

  const firstPending = items.findIndex((item) => item.status === 'pending');
  const anchor = firstPending >= 0 ? Math.max(0, firstPending - 2) : items.length;

  // Fill from the anchor forward, then pad backwards with earlier items
  const result: AnnotationItem[] = [];
  let used = 0;
  for (let i = anchor; i < items.length && used + lineCost(items[i]!) <= maxLines; i++) {
    result.push(items[i]!);
    used += lineCost(items[i]!);
  }
  for (let i = anchor - 1; i >= 0 && used + lineCost(items[i]!) <= maxLines; i--) {
    result.unshift(items[i]!);
    used += lineCost(items[i]!);
  }
  return result;
}

interface AnnotationRowProps {
  item: AnnotationItem;
  width?: number | undefined;
}

function AnnotationRow({ item, width }: AnnotationRowProps): JSX.Element {
  const statusColor = getAnnotationStatusColor(item.status);
  const statusIcon = getAnnotationStatusIcon(item.status);
  const intentIcon = getIntentIcon(item.intentType);
  const intentColor = getIntentColor(item.intentType);
  const commentWidth = Math.max(10, (width ?? 40) - 8);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={statusColor}>{statusIcon}</Text>
        <Text color={intentColor}> [{intentIcon}]</Text>
        <Text bold={item.status === 'pending'}> {item.moveNotation}</Text>
        {item.mandatory && <Text color={palette.dangerBright}> !</Text>}
        <Text dimColor> {item.intentType}</Text>
        <Text dimColor> p{item.priority.toFixed(1)}</Text>
        {item.status === 'filtered' && item.filtered && (
          <Text color={palette.muted}> ({item.filtered})</Text>
        )}
      </Box>
      {item.status === 'done' && item.comment && (
        <Box marginLeft={4}>
          <Text dimColor wrap="truncate">
            {truncate(item.comment, commentWidth)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}
