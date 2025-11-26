import { parse } from '@mliebelt/pgn-parser';

import { ChessPosition } from '../chess/position.js';
import { PgnParseError } from '../errors.js';
import type { GameMetadata, MoveInfo, ParsedGame } from '../index.js';

/**
 * Date object from pgn-parser
 */
interface RawDate {
  value: string;
  year?: number;
  month?: number;
  day?: number;
}

/**
 * TimeControl object from pgn-parser
 */
interface RawTimeControl {
  value: string;
  kind?: string;
  seconds?: number;
  increment?: number;
}

/**
 * Raw tags from pgn-parser (object format)
 */
interface RawTags {
  Event?: string;
  Site?: string;
  Date?: string | RawDate;
  Round?: string;
  White?: string;
  Black?: string;
  Result?: string;
  WhiteElo?: string | number;
  BlackElo?: string | number;
  TimeControl?: string | RawTimeControl[];
  ECO?: string;
  FEN?: string;
  [key: string]: unknown;
}

/**
 * Raw move from pgn-parser
 */
interface RawMove {
  notation?: {
    notation: string;
  };
  moveNumber?: number;
  variations?: RawMove[][];
  commentBefore?: string;
  commentAfter?: string;
  nag?: string[];
  turn?: 'w' | 'b';
}

/**
 * Raw game from pgn-parser
 */
interface RawGame {
  tags?: RawTags;
  moves?: RawMove[];
}

/**
 * Parse a PGN string into an array of ParsedGame objects
 *
 * @param pgnString - The PGN content to parse (can contain multiple games)
 * @returns Array of parsed games with metadata and moves
 * @throws PgnParseError if the PGN is malformed
 */
export function parsePgnString(pgnString: string): ParsedGame[] {
  if (!pgnString.trim()) {
    return [];
  }

  let parsed: RawGame[];
  try {
    parsed = parse(pgnString, { startRule: 'games' }) as RawGame[];
  } catch (err) {
    throw new PgnParseError(`Failed to parse PGN: ${err}`);
  }

  return parsed.map((game) => transformGame(game));
}

/**
 * Transform a raw parsed game into our ParsedGame format
 */
function transformGame(rawGame: RawGame): ParsedGame {
  const tags = rawGame.tags ?? {};
  const metadata = extractMetadata(tags);

  // Use FEN tag if present, otherwise start from standard position
  const startFen = typeof tags.FEN === 'string' ? tags.FEN : undefined;
  const position = startFen ? ChessPosition.fromFen(startFen) : new ChessPosition();

  const moves = processMoves(rawGame.moves ?? [], position);

  return { metadata, moves };
}

/**
 * Extract game metadata from PGN tags
 */
function extractMetadata(tags: RawTags): GameMetadata {
  const metadata: GameMetadata = {
    white: (typeof tags.White === 'string' ? tags.White : undefined) ?? 'Unknown',
    black: (typeof tags.Black === 'string' ? tags.Black : undefined) ?? 'Unknown',
    result: (typeof tags.Result === 'string' ? tags.Result : undefined) ?? '*',
  };

  // Only set optional properties if they have values
  if (typeof tags.Event === 'string') metadata.event = tags.Event;
  if (typeof tags.Site === 'string') metadata.site = tags.Site;
  if (typeof tags.Round === 'string') metadata.round = tags.Round;
  if (typeof tags.ECO === 'string') metadata.eco = tags.ECO;

  // Handle Date - can be string or object with value property
  const date = tags.Date;
  if (typeof date === 'string') {
    metadata.date = date;
  } else if (date && typeof date === 'object' && 'value' in date) {
    metadata.date = date.value;
  }

  // Handle TimeControl - can be string or array of objects
  const timeControl = tags.TimeControl;
  if (typeof timeControl === 'string') {
    metadata.timeControl = timeControl;
  } else if (Array.isArray(timeControl) && timeControl.length > 0 && timeControl[0]?.value) {
    metadata.timeControl = timeControl[0].value;
  }

  // Handle Elo - can be string or number
  const whiteElo = parseEloValue(tags.WhiteElo);
  if (whiteElo !== undefined) metadata.whiteElo = whiteElo;

  const blackElo = parseEloValue(tags.BlackElo);
  if (blackElo !== undefined) metadata.blackElo = blackElo;

  return metadata;
}

/**
 * Parse an Elo value which can be string or number
 */
function parseEloValue(elo: string | number | undefined): number | undefined {
  if (typeof elo === 'number') {
    // 0 is used by pgn-parser for unknown values like "?" or "-"
    return elo > 0 ? elo : undefined;
  }
  return parseElo(elo);
}

/**
 * Parse an Elo string to a number, returning undefined if invalid
 */
function parseElo(elo: string | undefined): number | undefined {
  if (!elo || elo === '?' || elo === '-') {
    return undefined;
  }
  const parsed = parseInt(elo, 10);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Process moves from the raw parser output into MoveInfo array
 */
function processMoves(rawMoves: RawMove[], position: ChessPosition): MoveInfo[] {
  const moves: MoveInfo[] = [];

  for (const rawMove of rawMoves) {
    // Skip if no notation (could be a comment-only entry)
    if (!rawMove.notation?.notation) {
      continue;
    }

    const san = rawMove.notation.notation;
    const result = position.move(san);

    moves.push({
      moveNumber: Math.floor(moves.length / 2) + 1,
      san: result.san,
      isWhiteMove: moves.length % 2 === 0,
      fenBefore: result.fenBefore,
      fenAfter: result.fenAfter,
    });
  }

  return moves;
}
