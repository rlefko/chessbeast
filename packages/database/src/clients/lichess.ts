/**
 * Lichess Elite database client
 */

import type { ReferenceGame, ReferenceGameResult } from '../types/reference.js';
import { hashFen } from '../utils/fen-hash.js';

import { BaseDatabaseClient, type DatabaseClientConfig } from './base.js';

/**
 * Default configuration for Lichess Elite database client
 */
export const DEFAULT_LICHESS_CONFIG: DatabaseClientConfig = {
  dbPath: 'lichess_elite.db',
  readonly: true,
  timeoutMs: 10000,
};

/**
 * Raw row from the games table
 */
interface RawGameRow {
  id: number;
  lichess_id: string | null;
  event: string | null;
  white: string;
  black: string;
  white_elo: number | null;
  black_elo: number | null;
  result: string;
  date: string | null;
  eco: string | null;
}

/**
 * Transform a raw database row to ReferenceGame
 */
function rowToReferenceGame(row: RawGameRow): ReferenceGame {
  const game: ReferenceGame = {
    id: row.id,
    white: row.white,
    black: row.black,
    result: row.result,
  };

  if (row.lichess_id !== null) {
    game.lichessId = row.lichess_id;
  }
  if (row.event !== null) {
    game.event = row.event;
  }
  if (row.white_elo !== null) {
    game.whiteElo = row.white_elo;
  }
  if (row.black_elo !== null) {
    game.blackElo = row.black_elo;
  }
  if (row.date !== null) {
    game.date = row.date;
  }
  if (row.eco !== null) {
    game.eco = row.eco;
  }

  return game;
}

/**
 * Client for Lichess Elite games database
 */
export class LichessEliteClient extends BaseDatabaseClient {
  constructor(config: Partial<DatabaseClientConfig> = {}) {
    super({
      ...DEFAULT_LICHESS_CONFIG,
      ...config,
    });
  }

  /**
   * Find reference games that reached a given position.
   *
   * @param fen - FEN position to search for
   * @param limit - Maximum number of games to return (default: 5)
   * @returns Reference games and total count
   */
  getReferenceGames(fen: string, limit: number = 5): ReferenceGameResult {
    const db = this.ensureConnected();
    const fenHash = hashFen(fen);

    // Get matching games with highest rated players first
    const gamesStmt = db.prepare(`
      SELECT DISTINCT
        g.id, g.lichess_id, g.event, g.white, g.black,
        g.white_elo, g.black_elo, g.result, g.date, g.eco
      FROM games g
      INNER JOIN positions p ON g.id = p.game_id
      WHERE p.fen_hash = ?
      ORDER BY COALESCE(g.white_elo, 0) + COALESCE(g.black_elo, 0) DESC
      LIMIT ?
    `);

    const rows = gamesStmt.all(fenHash, limit) as RawGameRow[];

    // Get total count
    const countStmt = db.prepare(`
      SELECT COUNT(DISTINCT g.id) as count
      FROM games g
      INNER JOIN positions p ON g.id = p.game_id
      WHERE p.fen_hash = ?
    `);

    const countRow = countStmt.get(fenHash) as { count: number };

    return {
      games: rows.map(rowToReferenceGame),
      totalCount: countRow.count,
    };
  }

  /**
   * Find reference games by ECO code.
   *
   * @param eco - ECO code to search for
   * @param limit - Maximum number of games to return (default: 10)
   * @returns Array of reference games
   */
  getByEco(eco: string, limit: number = 10): ReferenceGame[] {
    const db = this.ensureConnected();

    const stmt = db.prepare(`
      SELECT id, lichess_id, event, white, black,
             white_elo, black_elo, result, date, eco
      FROM games
      WHERE eco = ?
      ORDER BY COALESCE(white_elo, 0) + COALESCE(black_elo, 0) DESC
      LIMIT ?
    `);

    const rows = stmt.all(eco.toUpperCase(), limit) as RawGameRow[];
    return rows.map(rowToReferenceGame);
  }

  /**
   * Find reference games by player name.
   *
   * @param playerName - Player name to search for (partial match)
   * @param limit - Maximum number of games to return (default: 10)
   * @returns Array of reference games
   */
  getByPlayer(playerName: string, limit: number = 10): ReferenceGame[] {
    const db = this.ensureConnected();

    const stmt = db.prepare(`
      SELECT id, lichess_id, event, white, black,
             white_elo, black_elo, result, date, eco
      FROM games
      WHERE white LIKE ? OR black LIKE ?
      ORDER BY COALESCE(white_elo, 0) + COALESCE(black_elo, 0) DESC
      LIMIT ?
    `);

    const searchPattern = `%${playerName}%`;
    const rows = stmt.all(searchPattern, searchPattern, limit) as RawGameRow[];
    return rows.map(rowToReferenceGame);
  }

  /**
   * Get the total number of games in the database.
   *
   * @returns Total game count
   */
  getTotalGameCount(): number {
    const db = this.ensureConnected();
    const stmt = db.prepare('SELECT COUNT(*) as count FROM games');
    const row = stmt.get() as { count: number };
    return row.count;
  }
}
