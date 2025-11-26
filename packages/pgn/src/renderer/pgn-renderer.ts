import type { GameMetadata, MoveInfo, ParsedGame } from '../index.js';

/**
 * Render a ParsedGame back to PGN string format
 *
 * @param game - The parsed game to render
 * @returns Valid PGN string
 */
export function renderPgnString(game: ParsedGame): string {
  const parts: string[] = [];

  // Render tags (Seven Tag Roster first, then optional tags)
  parts.push(renderTags(game.metadata));
  parts.push('');

  // Render moves with result
  parts.push(renderMoves(game.moves, game.metadata.result));

  return parts.join('\n');
}

/**
 * Render the PGN tag section
 */
function renderTags(metadata: GameMetadata): string {
  const tags: string[] = [];

  // Seven Tag Roster (STR) - required tags in order
  tags.push(renderTag('Event', metadata.event ?? '?'));
  tags.push(renderTag('Site', metadata.site ?? '?'));
  tags.push(renderTag('Date', metadata.date ?? '????.??.??'));
  tags.push(renderTag('Round', metadata.round ?? '?'));
  tags.push(renderTag('White', metadata.white));
  tags.push(renderTag('Black', metadata.black));
  tags.push(renderTag('Result', metadata.result));

  // Optional supplemental tags
  if (metadata.whiteElo !== undefined) {
    tags.push(renderTag('WhiteElo', metadata.whiteElo.toString()));
  }
  if (metadata.blackElo !== undefined) {
    tags.push(renderTag('BlackElo', metadata.blackElo.toString()));
  }
  if (metadata.timeControl) {
    tags.push(renderTag('TimeControl', metadata.timeControl));
  }
  if (metadata.eco) {
    tags.push(renderTag('ECO', metadata.eco));
  }

  return tags.join('\n');
}

/**
 * Render a single PGN tag
 */
function renderTag(name: string, value: string): string {
  // Escape backslashes and quotes in the value
  const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[${name} "${escapedValue}"]`;
}

/**
 * Render the move text section
 */
function renderMoves(moves: MoveInfo[], result: string): string {
  const parts: string[] = [];

  for (const move of moves) {
    if (move.isWhiteMove) {
      parts.push(`${move.moveNumber}.`);
    }
    parts.push(move.san);
  }

  parts.push(result);

  return parts.join(' ');
}
