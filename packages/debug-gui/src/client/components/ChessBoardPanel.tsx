/**
 * Chess Board Panel
 *
 * Displays the current position with ASCII board, evaluation, and position info.
 * Content adapts to the available height (eval bar, info, and FEN drop off
 * before the board itself does).
 */

import { renderBoard } from '@chessbeast/pgn';
import { Box, Text } from 'ink';

import { useDebugStore } from '../state/store.js';
import { getClassificationColor, getEvalColor, palette } from '../theme.js';

import { EvalBar, formatEval } from './EvalBar.js';
import { Panel } from './Panel.js';

export interface ChessBoardPanelProps {
  focused?: boolean | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

/** Rows consumed by the panel border + title */
const PANEL_CHROME_ROWS = 3;

/** Rows the ASCII board occupies */
const BOARD_ROWS = 10;

export function ChessBoardPanel({
  focused = false,
  width,
  height,
}: ChessBoardPanelProps): JSX.Element {
  const chess = useDebugStore((state) => state.chess);

  // Render the ASCII board
  const boardString = renderBoard(chess.fen, { perspective: chess.perspective });

  // Adaptive content: decide what fits under the board
  const innerHeight = (height ?? 40) - PANEL_CHROME_ROWS;
  const showEvalBar = innerHeight >= BOARD_ROWS + 2;
  const showInfo = innerHeight >= BOARD_ROWS + 5;
  const showFen = innerHeight >= BOARD_ROWS + 8;

  const classificationColor = getClassificationColor(chess.classification);

  return (
    <Panel title="Chess Board" focused={focused} width={width} height={height}>
      <Box flexDirection="column">
        {/* ASCII Board */}
        <Box>
          <Text>{boardString}</Text>
        </Box>

        {/* Eval bar */}
        {showEvalBar && (
          <Box marginTop={1}>
            <EvalBar evaluation={chess.evaluation ?? {}} />
          </Box>
        )}

        {/* Position info */}
        {showInfo && (
          <Box flexDirection="column">
            <Box>
              <Text color={palette.accent} bold>
                {chess.moveNotation || 'Starting position'}
              </Text>
              {chess.classification && (
                <Text color={classificationColor}> ({chess.classification})</Text>
              )}
            </Box>

            <Box>
              <Text dimColor>Move: </Text>
              <Text>
                {chess.moveNumber > 0
                  ? `${chess.moveNumber}${chess.isWhiteMove ? '.' : '...'}`
                  : '-'}
              </Text>
              <Text dimColor> | Side: </Text>
              <Text>{chess.isWhiteMove ? 'White' : 'Black'}</Text>
              {chess.cpLoss !== undefined && chess.cpLoss > 0 && (
                <>
                  <Text dimColor> | Loss: </Text>
                  <Text
                    color={
                      chess.cpLoss > 100
                        ? palette.danger
                        : chess.cpLoss > 30
                          ? palette.warning
                          : palette.neutral
                    }
                  >
                    {chess.cpLoss}cp
                  </Text>
                </>
              )}
            </Box>

            {chess.bestMove && (
              <Box>
                <Text dimColor>Best: </Text>
                <Text color={palette.success}>{chess.bestMove}</Text>
                {chess.evaluation && (
                  <Text color={getEvalColor(chess.evaluation)}>
                    {' '}
                    ({formatEval(chess.evaluation)})
                  </Text>
                )}
              </Box>
            )}
          </Box>
        )}

        {/* FEN (truncated) */}
        {showFen && (
          <Box marginTop={1}>
            <Text dimColor wrap="truncate">
              {chess.fen}
            </Text>
          </Box>
        )}
      </Box>
    </Panel>
  );
}
