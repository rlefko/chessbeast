/**
 * Lichess Elite Database Loader
 *
 * Loads games from Lichess Elite PGN database into SQLite.
 * Data source: https://database.lichess.org/
 *
 * This loader processes PGN files and creates:
 * 1. games table - game metadata
 * 2. positions table - FEN hashes at each position for lookup
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

import BetterSqlite3 from 'better-sqlite3';

import { hashFen } from '../utils/fen-hash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the path to the data directory
 */
function getDataDir(): string {
  return path.resolve(__dirname, '../../../../../data');
}

/**
 * Get the path to the Lichess Elite source data
 */
function getLichessSourcePath(): string {
  return path.join(getDataDir(), 'lichess-elite.pgn');
}

/**
 * Create the Lichess Elite database schema
 */
function createSchema(db: BetterSqlite3.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS positions;
    DROP TABLE IF EXISTS games;

    CREATE TABLE games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lichess_id TEXT UNIQUE,
      event TEXT,
      white TEXT NOT NULL,
      black TEXT NOT NULL,
      white_elo INTEGER NOT NULL,
      black_elo INTEGER NOT NULL,
      result TEXT NOT NULL,
      date TEXT,
      eco TEXT,
      moves_uci TEXT NOT NULL
    );

    CREATE TABLE positions (
      game_id INTEGER NOT NULL,
      ply INTEGER NOT NULL,
      fen_hash TEXT NOT NULL,
      PRIMARY KEY (game_id, ply),
      FOREIGN KEY (game_id) REFERENCES games(id)
    ) WITHOUT ROWID;

    CREATE INDEX idx_positions_hash ON positions(fen_hash);
    CREATE INDEX idx_games_eco ON games(eco);
    CREATE INDEX idx_games_elo ON games(white_elo, black_elo);
  `);
}

/**
 * Parsed game from PGN
 */
interface ParsedGame {
  lichessId?: string;
  event?: string;
  white: string;
  black: string;
  whiteElo: number;
  blackElo: number;
  result: string;
  date?: string;
  eco?: string;
  movesUci: string;
  fens: string[];
}

/**
 * Extract Lichess game ID from Site tag
 */
function extractLichessId(site: string): string | undefined {
  const match = site.match(/lichess\.org\/(\w+)/);
  return match ? match[1] : undefined;
}

/**
 * Parse a PGN tag value
 */
function parseTagValue(line: string): { key: string; value: string } | null {
  const match = line.match(/^\[(\w+)\s+"(.*)"\]$/);
  if (!match) {
    return null;
  }
  return { key: match[1] ?? '', value: match[2] ?? '' };
}

/**
 * Simple chess position tracker for FEN generation
 * This is a simplified implementation that tracks positions
 */
class ChessPosition {
  private board: string[][];
  private turn: 'w' | 'b' = 'w';
  private castling: string = 'KQkq';
  private enPassant: string = '-';

  constructor() {
    // Initialize standard starting position
    this.board = [
      ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
      ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
      ['.', '.', '.', '.', '.', '.', '.', '.'],
      ['.', '.', '.', '.', '.', '.', '.', '.'],
      ['.', '.', '.', '.', '.', '.', '.', '.'],
      ['.', '.', '.', '.', '.', '.', '.', '.'],
      ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
      ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
    ];
  }

  /**
   * Apply a UCI move and return the resulting FEN
   */
  applyMove(uci: string): string {
    const fromFile = uci.charCodeAt(0) - 97;
    const fromRank = 8 - parseInt(uci[1] ?? '1');
    const toFile = uci.charCodeAt(2) - 97;
    const toRank = 8 - parseInt(uci[3] ?? '1');
    const promotion = uci[4];

    const piece = this.board[fromRank]?.[fromFile] ?? '.';

    // Move the piece
    if (this.board[fromRank]) {
      this.board[fromRank][fromFile] = '.';
    }

    // Handle promotion
    let targetPiece = piece;
    if (promotion) {
      targetPiece = this.turn === 'w' ? promotion.toUpperCase() : promotion.toLowerCase();
    }

    if (this.board[toRank]) {
      this.board[toRank][toFile] = targetPiece;
    }

    // Handle castling
    if (piece.toLowerCase() === 'k' && Math.abs(toFile - fromFile) === 2) {
      // Kingside
      if (toFile > fromFile && this.board[fromRank]) {
        this.board[fromRank][5] = this.board[fromRank][7] ?? '.';
        this.board[fromRank][7] = '.';
      }
      // Queenside
      if (toFile < fromFile && this.board[fromRank]) {
        this.board[fromRank][3] = this.board[fromRank][0] ?? '.';
        this.board[fromRank][0] = '.';
      }
    }

    // Handle en passant capture
    if (piece.toLowerCase() === 'p' && toFile !== fromFile) {
      const captureSquare = this.enPassant;
      if (captureSquare !== '-') {
        const epFile = captureSquare.charCodeAt(0) - 97;
        const epRank = 8 - parseInt(captureSquare[1] ?? '1');
        // If capturing en passant
        if (toFile === epFile && toRank === epRank) {
          const capturedRank = this.turn === 'w' ? epRank + 1 : epRank - 1;
          if (this.board[capturedRank]) {
            this.board[capturedRank][epFile] = '.';
          }
        }
      }
    }

    // Update en passant
    this.enPassant = '-';
    if (piece.toLowerCase() === 'p' && Math.abs(toRank - fromRank) === 2) {
      const epRank = this.turn === 'w' ? toRank + 1 : toRank - 1;
      this.enPassant = String.fromCharCode(97 + toFile) + (8 - epRank);
    }

    // Update castling rights
    if (piece.toLowerCase() === 'k') {
      if (this.turn === 'w') {
        this.castling = this.castling.replace(/[KQ]/g, '');
      } else {
        this.castling = this.castling.replace(/[kq]/g, '');
      }
    }
    if (piece.toLowerCase() === 'r') {
      if (fromFile === 0 && fromRank === 7) this.castling = this.castling.replace('Q', '');
      if (fromFile === 7 && fromRank === 7) this.castling = this.castling.replace('K', '');
      if (fromFile === 0 && fromRank === 0) this.castling = this.castling.replace('q', '');
      if (fromFile === 7 && fromRank === 0) this.castling = this.castling.replace('k', '');
    }

    // Switch turn
    this.turn = this.turn === 'w' ? 'b' : 'w';

    return this.toFen();
  }

  /**
   * Generate FEN string (without move counters)
   */
  toFen(): string {
    let fen = '';

    for (let rank = 0; rank < 8; rank++) {
      let emptyCount = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.board[rank]?.[file] ?? '.';
        if (piece === '.') {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            fen += emptyCount;
            emptyCount = 0;
          }
          fen += piece;
        }
      }
      if (emptyCount > 0) {
        fen += emptyCount;
      }
      if (rank < 7) {
        fen += '/';
      }
    }

    const castlingStr = this.castling || '-';
    return `${fen} ${this.turn} ${castlingStr} ${this.enPassant}`;
  }

  /**
   * Get starting position FEN
   */
  static startingFen(): string {
    return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
  }
}

/**
 * Parse PGN and extract game data
 */
async function* parseGames(pgnPath: string): AsyncGenerator<ParsedGame> {
  const fileStream = fs.createReadStream(pgnPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let tags: Record<string, string> = {};
  let moveText = '';
  let inGame = false;

  for await (const line of rl) {
    // Tag line
    if (line.startsWith('[')) {
      const tag = parseTagValue(line);
      if (tag) {
        tags[tag.key] = tag.value;
      }
      inGame = true;
      continue;
    }

    // Empty line after tags - start of moves
    if (line.trim() === '' && inGame && Object.keys(tags).length > 0 && moveText === '') {
      continue;
    }

    // Move text
    if (inGame && line.trim() !== '') {
      moveText += ' ' + line.trim();
      continue;
    }

    // End of game
    if (inGame && line.trim() === '' && moveText !== '') {
      // Parse the game
      const whiteElo = parseInt(tags['WhiteElo'] ?? '0') || 0;
      const blackElo = parseInt(tags['BlackElo'] ?? '0') || 0;

      // Only include games with high-rated players
      if (whiteElo >= 2200 && blackElo >= 2200) {
        // Extract UCI moves from move text
        // Lichess PGN usually includes comments with UCI: { [%clk 0:03:00] }
        // and eval: { [%eval 0.17] }
        // We need to strip these and convert SAN to UCI

        // For Lichess Elite, moves are in SAN - we'll store the raw move text
        // and generate FENs (just starting position for now, full FEN tracking
        // would require chess.js integration)
        const fens: string[] = [ChessPosition.startingFen()];

        // Try to extract moves (simplified - assumes clean SAN)
        const cleanMoves = moveText
          .replace(/\{[^}]*\}/g, '') // Remove comments
          .replace(/\([^)]*\)/g, '') // Remove variations
          .replace(/\$\d+/g, '') // Remove NAGs
          .replace(/\d+\.\.\./g, '') // Remove continuation dots
          .replace(/\d+\./g, '') // Remove move numbers
          .replace(/[+#!?]+/g, '') // Remove check/mate/annotations
          .replace(/1-0|0-1|1\/2-1\/2|\*/g, '') // Remove result
          .trim()
          .split(/\s+/)
          .filter((m) => m.length > 0);

        // Store as space-separated moves (we'd need chess.js for proper UCI conversion)
        const movesUci = cleanMoves.join(' ');

        // Build game object with only defined optional properties
        const game: ParsedGame = {
          white: tags['White'] ?? 'Unknown',
          black: tags['Black'] ?? 'Unknown',
          whiteElo,
          blackElo,
          result: tags['Result'] ?? '*',
          movesUci,
          fens,
        };

        const lichessId = extractLichessId(tags['Site'] ?? '');
        if (lichessId) {
          game.lichessId = lichessId;
        }
        if (tags['Event']) {
          game.event = tags['Event'];
        }
        if (tags['Date']) {
          game.date = tags['Date'];
        }
        if (tags['ECO']) {
          game.eco = tags['ECO'];
        }

        yield game;
      }

      // Reset for next game
      tags = {};
      moveText = '';
      inGame = false;
    }
  }
}

/**
 * Main loader function
 */
export async function loadLichessDatabase(
  dbPath?: string,
  pgnPath?: string,
  maxGames?: number,
): Promise<void> {
  const targetPath = dbPath ?? path.join(getDataDir(), 'lichess_elite.db');
  const sourcePath = pgnPath ?? getLichessSourcePath();

  // Check if source data exists
  if (!fs.existsSync(sourcePath)) {
    console.error(`Lichess Elite PGN not found: ${sourcePath}`);
    console.error('Please run: bash scripts/download-lichess-elite.sh');
    process.exit(1);
  }

  console.log(`Creating Lichess Elite database at: ${targetPath}`);
  console.log(`Loading from: ${sourcePath}`);
  if (maxGames) {
    console.log(`Limiting to: ${maxGames} games`);
  }

  // Create database
  const db = new BetterSqlite3(targetPath);

  try {
    // Enable WAL mode for better write performance
    db.pragma('journal_mode = WAL');

    // Create schema
    console.log('Creating schema...');
    createSchema(db);

    // Prepare statements
    const insertGame = db.prepare(`
      INSERT INTO games (lichess_id, event, white, black, white_elo, black_elo, result, date, eco, moves_uci)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPosition = db.prepare(`
      INSERT INTO positions (game_id, ply, fen_hash)
      VALUES (?, ?, ?)
    `);

    // Begin transaction for better performance
    const insertBatch = db.transaction((games: Array<{ game: ParsedGame; gameId: number }>) => {
      for (const { game, gameId } of games) {
        // Insert positions (just starting position for now)
        for (let ply = 0; ply < game.fens.length; ply++) {
          const fen = game.fens[ply];
          if (fen) {
            insertPosition.run(gameId, ply, hashFen(fen));
          }
        }
      }
    });

    let gameCount = 0;
    let batchGames: Array<{ game: ParsedGame; gameId: number }> = [];
    const BATCH_SIZE = 1000;

    console.log('Loading games...');

    for await (const game of parseGames(sourcePath)) {
      if (maxGames && gameCount >= maxGames) {
        break;
      }

      // Insert game
      const result = insertGame.run(
        game.lichessId ?? null,
        game.event ?? null,
        game.white,
        game.black,
        game.whiteElo,
        game.blackElo,
        game.result,
        game.date ?? null,
        game.eco ?? null,
        game.movesUci,
      );

      const gameId = Number(result.lastInsertRowid);
      batchGames.push({ game, gameId });

      gameCount++;

      // Insert positions in batches
      if (batchGames.length >= BATCH_SIZE) {
        insertBatch(batchGames);
        batchGames = [];
        if (gameCount % 10000 === 0) {
          console.log(`  Loaded ${gameCount} games...`);
        }
      }
    }

    // Insert remaining
    if (batchGames.length > 0) {
      insertBatch(batchGames);
    }

    // Optimize database
    console.log('Optimizing database...');
    db.exec('ANALYZE');

    console.log(`Done! Loaded ${gameCount} games.`);
  } finally {
    db.close();
  }
}

// Run if executed directly
const isMainModule =
  process.argv[1] &&
  (import.meta.url.endsWith(path.basename(process.argv[1])) ||
    import.meta.url.includes('lichess-loader'));

if (isMainModule) {
  const maxGames = process.argv[2] ? parseInt(process.argv[2]) : undefined;
  loadLichessDatabase(undefined, undefined, maxGames).catch(console.error);
}
