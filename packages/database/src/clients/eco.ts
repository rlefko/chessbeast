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
   * @param movesSan - Array of moves in SAN format (e.g., ["e4", "c5"])
   * @returns Opening lookup result with match information
   */
  getOpeningByMoves(movesSan: string[]): OpeningLookupResult {
    if (movesSan.length === 0) {
      return {
        matchedPlies: 0,
        isExactMatch: false,
      };
    }

    const db = this.ensureConnected();

    // Build the moves string for prefix matching
    const movesStr = movesSan.join(' ');

    // Find the longest matching opening
    // We look for openings whose moves_san is a prefix of our moves
    const stmt = db.prepare(`
      SELECT * FROM openings
      WHERE ? LIKE moves_san || '%' OR ? LIKE moves_san || ' %'
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
    const isExact = movesSan.length === opening.numPlies;
    const leftTheory = movesSan.length > opening.numPlies;

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
