/**
 * ECO Database Loader
 *
 * Loads opening data from Lichess chess-openings TSV files into SQLite database.
 * Data source: https://github.com/lichess-org/chess-openings
 *
 * TSV format: eco \t name \t pgn \t uci \t epd
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import BetterSqlite3 from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the path to the data directory
 */
function getDataDir(): string {
  // Navigate from packages/database/dist/loaders/ to data/
  // dist/loaders -> dist -> database -> packages -> chessbeast -> data
  return path.resolve(__dirname, '../../../../data');
}

/**
 * Get the path to the ECO source data directory
 */
function getEcoSourceDir(): string {
  return path.join(getDataDir(), 'eco-source');
}

/**
 * Create the ECO database schema
 */
function createSchema(db: BetterSqlite3.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS openings;

    CREATE TABLE openings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eco_code TEXT NOT NULL,
      name TEXT NOT NULL,
      moves_san TEXT NOT NULL,
      num_plies INTEGER NOT NULL
    );

    CREATE INDEX idx_eco_code ON openings(eco_code);
    CREATE INDEX idx_num_plies ON openings(num_plies DESC);
  `);
}

/**
 * Parse a TSV line into opening data
 * Format: eco \t name \t pgn (3 columns, simplified format from Lichess)
 */
interface OpeningRow {
  eco: string;
  name: string;
  pgn: string;
}

function parseTsvLine(line: string): OpeningRow | null {
  const parts = line.split('\t');
  if (parts.length < 3) {
    return null;
  }

  return {
    eco: parts[0] ?? '',
    name: parts[1] ?? '',
    pgn: parts[2] ?? '',
  };
}

/**
 * Convert PGN move sequence to SAN-only (remove move numbers)
 */
function pgnToSan(pgn: string): string {
  // Remove move numbers like "1." "2." etc., and extra whitespace
  return pgn
    .replace(/\d+\.\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Load a single TSV file into the database
 */
function loadTsvFile(
  _db: BetterSqlite3.Database,
  filePath: string,
  insertStmt: BetterSqlite3.Statement,
): number {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  let count = 0;

  // Skip header line if present
  const startIndex = lines[0]?.startsWith('eco\t') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim().length === 0) {
      continue;
    }

    const row = parseTsvLine(line);
    if (!row) {
      console.warn(`Skipping malformed line ${i + 1} in ${filePath}`);
      continue;
    }

    const movesSan = pgnToSan(row.pgn);
    // Count plies from SAN moves (each space-separated token is a ply)
    const numPlies = movesSan.split(' ').filter((m) => m.length > 0).length;

    insertStmt.run(row.eco, row.name, movesSan, numPlies);
    count++;
  }

  return count;
}

/**
 * Main loader function
 */
export function loadEcoDatabase(dbPath?: string): void {
  const targetPath = dbPath ?? path.join(getDataDir(), 'eco.db');
  const sourceDir = getEcoSourceDir();

  // Check if source data exists
  if (!fs.existsSync(sourceDir)) {
    console.error(`ECO source directory not found: ${sourceDir}`);
    console.error('Please run: bash scripts/download-eco.sh');
    process.exit(1);
  }

  console.log(`Creating ECO database at: ${targetPath}`);
  console.log(`Loading from: ${sourceDir}`);

  // Create database
  const db = new BetterSqlite3(targetPath);

  try {
    // Enable WAL mode for better write performance
    db.pragma('journal_mode = WAL');

    // Create schema
    console.log('Creating schema...');
    createSchema(db);

    // Prepare insert statement
    const insertStmt = db.prepare(`
      INSERT INTO openings (eco_code, name, moves_san, num_plies)
      VALUES (?, ?, ?, ?)
    `);

    // Load each TSV file
    const letters = ['a', 'b', 'c', 'd', 'e'];
    let totalCount = 0;

    for (const letter of letters) {
      const filePath = path.join(sourceDir, `${letter}.tsv`);
      if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        continue;
      }

      const count = loadTsvFile(db, filePath, insertStmt);
      console.log(`  Loaded ${count} openings from ${letter}.tsv`);
      totalCount += count;
    }

    // Optimize database
    console.log('Optimizing database...');
    db.exec('ANALYZE');

    console.log(`Done! Loaded ${totalCount} openings.`);
  } finally {
    db.close();
  }
}

// Run if executed directly
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  loadEcoDatabase();
}
