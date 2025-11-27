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

  // Render game comment if present (before first move)
  if (game.gameComment) {
    parts.push(`{${escapeComment(game.gameComment)}}`);
    parts.push('');
  }

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
    // Comment before move
    if (move.commentBefore) {
      parts.push(`{${escapeComment(move.commentBefore)}}`);
    }

    // Move number for white moves
    if (move.isWhiteMove) {
      parts.push(`${move.moveNumber}.`);
    }

    // The move itself
    parts.push(move.san);

    // NAGs immediately after move
    if (move.nags && move.nags.length > 0) {
      parts.push(move.nags.join(' '));
    }

    // Comment after move
    if (move.commentAfter) {
      parts.push(`{${escapeComment(move.commentAfter)}}`);
    }

    // Variations
    if (move.variations && move.variations.length > 0) {
      for (const variation of move.variations) {
        parts.push(renderVariation(variation));
      }
    }
  }

  parts.push(result);

  return parts.join(' ');
}

/**
 * Render a variation (alternative line) in parentheses
 */
function renderVariation(moves: MoveInfo[]): string {
  if (moves.length === 0) {
    return '()';
  }

  const parts: string[] = ['('];

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i]!;

    // Comment before move
    if (move.commentBefore) {
      parts.push(`{${escapeComment(move.commentBefore)}}`);
    }

    // First move in variation always needs explicit move number
    // Black moves starting a variation need "N..." format
    if (i === 0) {
      if (move.isWhiteMove) {
        parts.push(`${move.moveNumber}.`);
      } else {
        parts.push(`${move.moveNumber}...`);
      }
    } else if (move.isWhiteMove) {
      parts.push(`${move.moveNumber}.`);
    }

    // The move itself
    parts.push(move.san);

    // NAGs immediately after move
    if (move.nags && move.nags.length > 0) {
      parts.push(move.nags.join(' '));
    }

    // Comment after move
    if (move.commentAfter) {
      parts.push(`{${escapeComment(move.commentAfter)}}`);
    }

    // Handle nested variations recursively
    if (move.variations && move.variations.length > 0) {
      for (const nestedVar of move.variations) {
        parts.push(renderVariation(nestedVar));
      }
    }
  }

  parts.push(')');

  return parts.join(' ');
}

/**
 * Escape special characters in comments
 * PGN comments are enclosed in braces, so we need to escape closing braces
 */
function escapeComment(comment: string): string {
  // Escape closing braces in comments
  return comment.replace(/\}/g, '\\}');
}
