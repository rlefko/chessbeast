/**
 * Reference game type definitions
 */

/**
 * A reference game from the Lichess Elite database
 */
export interface ReferenceGame {
  /** Internal database ID */
  id: number;
  /** Lichess game ID */
  lichessId?: string;
  /** Event name */
  event?: string;
  /** White player name */
  white: string;
  /** Black player name */
  black: string;
  /** White player Elo rating */
  whiteElo?: number;
  /** Black player Elo rating */
  blackElo?: number;
  /** Game result ("1-0", "0-1", "1/2-1/2") */
  result: string;
  /** Date of the game (YYYY.MM.DD format) */
  date?: string;
  /** ECO code of the opening */
  eco?: string;
}

/**
 * Result of looking up reference games by position
 */
export interface ReferenceGameResult {
  /** List of matching reference games */
  games: ReferenceGame[];
  /** Total count of matching games (may be more than returned) */
  totalCount: number;
}
