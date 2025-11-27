/**
 * Opening-related type definitions
 */

/**
 * Information about a chess opening from the ECO database
 */
export interface OpeningInfo {
  /** ECO code (e.g., "B90") */
  eco: string;
  /** Opening name (e.g., "Sicilian Defense: Najdorf Variation") */
  name: string;
  /** Main line moves in SAN notation */
  mainLine: string[];
  /** Moves in UCI format (space-separated) */
  movesUci: string;
  /** EPD (Extended Position Description) after the moves */
  epd: string;
  /** Number of half-moves (plies) in the opening line */
  numPlies: number;
}

/**
 * Result of looking up an opening by moves
 */
export interface OpeningLookupResult {
  /** The matched opening, if found */
  opening?: OpeningInfo;
  /** Number of plies that matched the opening */
  matchedPlies: number;
  /** Ply number where game left known theory (1-indexed), if applicable */
  leftTheoryAtPly?: number;
  /** Whether the game matches the opening exactly (all moves match) */
  isExactMatch: boolean;
}
