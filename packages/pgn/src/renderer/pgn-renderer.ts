import type { GameMetadata, MoveInfo, ParsedGame } from '../index.js';

/**
 * Default maximum line length for PGN output
 */
export const DEFAULT_MAX_LINE_LENGTH = 80;

/**
 * Options for PGN rendering
 */
export interface RenderOptions {
  /**
   * Maximum line length for move text (default: 80)
   * Set to 0 or undefined to disable line wrapping
   */
  maxLineLength?: number;
}

/**
 * Render a ParsedGame back to PGN string format
 *
 * @param game - The parsed game to render
 * @param options - Optional rendering options
 * @returns Valid PGN string
 */
export function renderPgnString(game: ParsedGame, options?: RenderOptions): string {
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
  const moveText = renderMoves(game.moves, game.metadata.result);

  // Apply line wrapping if enabled
  const maxLineLength = options?.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;
  if (maxLineLength > 0) {
    parts.push(wrapMoveText(moveText, maxLineLength));
  } else {
    parts.push(moveText);
  }

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

    // Variations (filter out empty ones)
    if (move.variations && move.variations.length > 0) {
      for (const variation of move.variations) {
        const rendered = renderVariation(variation);
        if (rendered) {
          parts.push(rendered);
        }
      }
    }
  }

  parts.push(result);

  return parts.join(' ');
}

/**
 * Render a variation (alternative line) in parentheses
 * Returns empty string if no valid moves to render
 */
function renderVariation(moves: MoveInfo[]): string {
  if (moves.length === 0) {
    return ''; // Don't render empty variations
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

    // Handle nested variations recursively (filter out empty ones)
    if (move.variations && move.variations.length > 0) {
      for (const nestedVar of move.variations) {
        const rendered = renderVariation(nestedVar);
        if (rendered) {
          parts.push(rendered);
        }
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

/**
 * Wrap move text to respect maximum line length
 *
 * This preserves the PGN structure by:
 * - Breaking at word boundaries (spaces)
 * - Never breaking inside comments (braces) or variations (parentheses)
 * - Maintaining proper spacing
 *
 * @param text - The move text to wrap
 * @param maxLength - Maximum line length
 * @returns Wrapped text with newlines
 */
export function wrapMoveText(text: string, maxLength: number): string {
  if (!text || maxLength <= 0) {
    return text;
  }

  // Tokenize the move text while preserving structure
  const tokens = tokenizeMoveText(text);
  const lines: string[] = [];
  let currentLine = '';

  for (const token of tokens) {
    // Check if adding this token would exceed the line length
    const wouldExceed = currentLine.length > 0 && currentLine.length + 1 + token.length > maxLength;

    if (wouldExceed && currentLine.length > 0) {
      // Start a new line
      lines.push(currentLine);
      currentLine = token;
    } else {
      // Add to current line
      if (currentLine.length > 0) {
        currentLine += ' ' + token;
      } else {
        currentLine = token;
      }
    }
  }

  // Add the final line
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.join('\n');
}

/**
 * Tokenize move text while preserving comments and variations as single tokens
 */
function tokenizeMoveText(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < text.length) {
    // Skip leading whitespace
    while (i < text.length && text[i] === ' ') {
      i++;
    }

    if (i >= text.length) break;

    const char = text[i]!;

    if (char === '{') {
      // Comment: find matching closing brace
      const end = findMatchingBrace(text, i, '{', '}');
      tokens.push(text.slice(i, end + 1));
      i = end + 1;
    } else if (char === '(') {
      // Variation: find matching closing parenthesis
      const end = findMatchingBrace(text, i, '(', ')');
      tokens.push(text.slice(i, end + 1));
      i = end + 1;
    } else {
      // Regular token: collect until whitespace, brace, or parenthesis
      let j = i;
      while (j < text.length && text[j] !== ' ' && text[j] !== '{' && text[j] !== '(') {
        j++;
      }
      if (j > i) {
        tokens.push(text.slice(i, j));
      }
      i = j;
    }
  }

  return tokens;
}

/**
 * Find the index of the matching closing brace/parenthesis
 */
function findMatchingBrace(text: string, start: number, open: string, close: string): number {
  let depth = 0;

  for (let i = start; i < text.length; i++) {
    const char = text[i]!;

    // Handle escape sequences (for comments with \})
    if (char === '\\' && i + 1 < text.length) {
      i++; // Skip the escaped character
      continue;
    }

    if (char === open) {
      depth++;
    } else if (char === close) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  // If no match found, return end of string
  return text.length - 1;
}

/**
 * Result of PGN validation and auto-fix
 */
export interface PgnFixResult {
  /** The fixed game (may be same as input if no fixes needed) */
  fixed: ParsedGame;
  /** Warnings about issues that were auto-fixed */
  warnings: string[];
}

/**
 * Validate and auto-fix common PGN structural issues
 *
 * Currently fixes:
 * - Variations that start with the same move as the main line (removes them)
 * - Empty variations (removes them)
 *
 * @param game - The parsed game to validate
 * @returns Fixed game and list of warnings
 */
export function validateAndFixPgn(game: ParsedGame): PgnFixResult {
  const warnings: string[] = [];

  // Deep clone to avoid mutating input
  const fixed: ParsedGame = {
    metadata: { ...game.metadata },
    moves: game.moves.map((move) => fixMoveVariations(move, warnings)),
  };

  if (game.gameComment) {
    fixed.gameComment = game.gameComment;
  }

  return { fixed, warnings };
}

/**
 * Fix variations on a single move, returning the fixed move
 */
function fixMoveVariations(move: MoveInfo, warnings: string[]): MoveInfo {
  // If no variations, return move as-is
  if (!move.variations || move.variations.length === 0) {
    return { ...move };
  }

  const fixedVariations: MoveInfo[][] = [];

  for (const variation of move.variations) {
    // Skip empty variations
    if (variation.length === 0) {
      warnings.push(`Move ${move.moveNumber}: Removed empty variation`);
      continue;
    }

    // Skip variations that start with the same move as main line
    const firstMove = variation[0];
    if (firstMove && firstMove.san === move.san) {
      warnings.push(
        `Move ${move.moveNumber}: Removed variation starting with main line move (${move.san})`,
      );
      continue;
    }

    // Recursively fix nested variations within this variation
    const fixedVariation = variation.map((m) => fixMoveVariations(m, warnings));
    fixedVariations.push(fixedVariation);
  }

  // Return move with fixed variations
  const result: MoveInfo = { ...move };
  if (fixedVariations.length > 0) {
    result.variations = fixedVariations;
  } else {
    delete result.variations;
  }

  return result;
}
