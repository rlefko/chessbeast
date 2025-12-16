/**
 * Chess Board Panel
 *
 * Displays the current position with ASCII board, evaluation, and position info.
 */

import { Box, Text } from 'ink';
import { renderBoard } from '@chessbeast/pgn';
import { Panel } from './Panel.js';
import { EvalBar, formatEval, getEvalColor } from './EvalBar.js';
import { useDebugStore } from '../state/store.js';

export interface ChessBoardPanelProps {
  focused?: boolean | undefined;
  width?: string | number | undefined;
  height?: string | number | undefined;
}

export function ChessBoardPanel({ focused = false, width, height }: ChessBoardPanelProps) {
  const { chess } = useDebugStore();

  // Render the ASCII board
  const boardString = renderBoard(chess.fen, { perspective: chess.perspective });

  // Classification colors
  const classificationColor = getClassificationColor(chess.classification);

  return (
    <Panel title="Chess Board" focused={focused} width={width} height={height}>
      <Box flexDirection="column">
        {/* ASCII Board */}
        <Box marginBottom={1}>
          <Text>{boardString}</Text>
        </Box>

        {/* Eval bar */}
        <Box marginBottom={1}>
          <EvalBar evaluation={chess.evaluation ?? {}} />
        </Box>

        {/* Position info */}
        <Box flexDirection="column">
          <Box>
            <Text color="cyan" bold>
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
          </Box>

          {chess.bestMove && (
            <Box>
              <Text dimColor>Best: </Text>
              <Text color="green">{chess.bestMove}</Text>
              {chess.evaluation && (
                <Text color={getEvalColor(chess.evaluation)}>
                  {' '}
                  ({formatEval(chess.evaluation)})
                </Text>
              )}
            </Box>
          )}

          {chess.cpLoss !== undefined && chess.cpLoss > 0 && (
            <Box>
              <Text dimColor>CP Loss: </Text>
              <Text color={chess.cpLoss > 100 ? 'red' : chess.cpLoss > 30 ? 'yellow' : 'white'}>
                {chess.cpLoss}
              </Text>
            </Box>
          )}
        </Box>

        {/* FEN (truncated) */}
        <Box marginTop={1}>
          <Text dimColor wrap="truncate">
            {chess.fen}
          </Text>
        </Box>
      </Box>
    </Panel>
  );
}

function getClassificationColor(classification?: string): string {
  switch (classification) {
    case 'brilliant':
      return 'cyanBright';
    case 'great':
    case 'best':
      return 'greenBright';
    case 'good':
      return 'green';
    case 'book':
    case 'normal':
      return 'white';
    case 'inaccuracy':
      return 'yellow';
    case 'mistake':
      return 'red';
    case 'blunder':
      return 'redBright';
    default:
      return 'gray';
  }
}
