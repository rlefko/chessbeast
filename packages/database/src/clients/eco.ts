/**
 * ECO opening database client
 */

import type { OpeningInfo, OpeningLookupResult } from '../types/opening.js';

import { BaseDatabaseClient, type DatabaseClientConfig } from './base.js';

/**
 * Default configuration for ECO database client
 */
export const DEFAULT_ECO_CONFIG: DatabaseClientConfig = {
  dbPath: 'eco.db',
  readonly: true,
  timeoutMs: 5000,
};

/**
 * Raw row from the openings table
 */
interface RawOpeningRow {
  id: number;
  eco_code: string;
  name: string;
  moves_san: string;
  moves_uci: string;
  epd: string;
  num_plies: number;
}

/**
 * Transform a raw database row to OpeningInfo
 */
function rowToOpeningInfo(row: RawOpeningRow): OpeningInfo {
  return {
    eco: row.eco_code,
    name: row.name,
    mainLine: row.moves_san.split(' ').filter((m) => m.length > 0),
    movesUci: row.moves_uci,
    epd: row.epd,
    numPlies: row.num_plies,
  };
}

/**
 * Client for ECO opening classification database
 */
export class EcoClient extends BaseDatabaseClient {
  constructor(config: Partial<DatabaseClientConfig> = {}) {
    super({
      ...DEFAULT_ECO_CONFIG,
      ...config,
    });
  }

  /**
   * Find the best matching opening for a sequence of moves.
   * Returns the longest matching opening from the database.
   *
   * @param movesUci - Array of moves in UCI format (e.g., ["e2e4", "c7c5"])
   * @returns Opening lookup result with match information
   */
  getOpeningByMoves(movesUci: string[]): OpeningLookupResult {
    if (movesUci.length === 0) {
      return {
        matchedPlies: 0,
        isExactMatch: false,
      };
    }

    const db = this.ensureConnected();

    // Build the moves string for prefix matching
    const movesStr = movesUci.join(' ');

    // Find the longest matching opening
    // We look for openings whose moves_uci is a prefix of our moves
    const stmt = db.prepare(`
      SELECT * FROM openings
      WHERE ? LIKE moves_uci || '%' OR ? LIKE moves_uci || ' %'
      ORDER BY num_plies DESC
      LIMIT 1
    `);

    const row = stmt.get(movesStr, movesStr) as RawOpeningRow | undefined;

    if (!row) {
      return {
        matchedPlies: 0,
        isExactMatch: false,
        leftTheoryAtPly: 1,
      };
    }

    const opening = rowToOpeningInfo(row);
    const isExact = movesUci.length === opening.numPlies;
    const leftTheory = movesUci.length > opening.numPlies;

    const result: OpeningLookupResult = {
      opening,
      matchedPlies: opening.numPlies,
      isExactMatch: isExact,
    };

    if (leftTheory) {
      result.leftTheoryAtPly = opening.numPlies + 1;
    }

    return result;
  }

  /**
   * Get opening information by ECO code.
   *
   * @param eco - ECO code (e.g., "B90")
   * @returns Opening info or undefined if not found
   */
  getByEco(eco: string): OpeningInfo | undefined {
    const db = this.ensureConnected();

    // Get the main line for this ECO code (shortest one with this code)
    const stmt = db.prepare(`
      SELECT * FROM openings
      WHERE eco_code = ?
      ORDER BY num_plies ASC
      LIMIT 1
    `);

    const row = stmt.get(eco.toUpperCase()) as RawOpeningRow | undefined;
    return row ? rowToOpeningInfo(row) : undefined;
  }

  /**
   * Get opening information by position (EPD).
   *
   * @param epd - EPD string (FEN without move counters)
   * @returns Opening info or undefined if not found
   */
  getByPosition(epd: string): OpeningInfo | undefined {
    const db = this.ensureConnected();

    const stmt = db.prepare(`
      SELECT * FROM openings
      WHERE epd = ?
      LIMIT 1
    `);

    const row = stmt.get(epd) as RawOpeningRow | undefined;
    return row ? rowToOpeningInfo(row) : undefined;
  }

  /**
   * Get all variations for an ECO code.
   *
   * @param eco - ECO code (e.g., "B90")
   * @returns Array of opening variations
   */
  getVariations(eco: string): OpeningInfo[] {
    const db = this.ensureConnected();

    const stmt = db.prepare(`
      SELECT * FROM openings
      WHERE eco_code = ?
      ORDER BY num_plies ASC
    `);

    const rows = stmt.all(eco.toUpperCase()) as RawOpeningRow[];
    return rows.map(rowToOpeningInfo);
  }
}
