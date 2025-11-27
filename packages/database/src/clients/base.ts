/**
 * Base database client with connection management
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import Database from 'better-sqlite3';

import { ConnectionError, DatabaseNotFoundError } from '../errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configuration for database client connections
 */
export interface DatabaseClientConfig {
  /** Path to the database file (relative to data directory or absolute) */
  dbPath: string;
  /** Whether to open in read-only mode (default: true) */
  readonly?: boolean;
  /** Timeout in milliseconds for database operations */
  timeoutMs?: number;
}

/**
 * Base class for SQLite database clients
 */
export abstract class BaseDatabaseClient {
  protected db: Database.Database | null = null;
  protected readonly config: Required<DatabaseClientConfig>;

  constructor(config: DatabaseClientConfig) {
    this.config = {
      dbPath: config.dbPath,
      readonly: config.readonly ?? true,
      timeoutMs: config.timeoutMs ?? 5000,
    };
  }

  /**
   * Get the default data directory path
   */
  protected getDataDir(): string {
    // Navigate from packages/database/src/clients/ to data/
    return path.resolve(__dirname, '../../../../../data');
  }

  /**
   * Resolve the full database path
   */
  protected getFullDbPath(): string {
    if (path.isAbsolute(this.config.dbPath)) {
      return this.config.dbPath;
    }
    return path.join(this.getDataDir(), this.config.dbPath);
  }

  /**
   * Ensure database connection is established (lazy initialization)
   */
  protected ensureConnected(): Database.Database {
    if (this.db) {
      return this.db;
    }

    const fullPath = this.getFullDbPath();

    // Check if database file exists
    if (!fs.existsSync(fullPath)) {
      throw new DatabaseNotFoundError(fullPath);
    }

    try {
      this.db = new Database(fullPath, {
        readonly: this.config.readonly,
        timeout: this.config.timeoutMs,
      });

      // Enable WAL mode for better concurrency
      if (!this.config.readonly) {
        this.db.pragma('journal_mode = WAL');
      }

      return this.db;
    } catch (err) {
      throw new ConnectionError(fullPath, err as Error);
    }
  }

  /**
   * Close the database connection
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Get the configured database path
   */
  public get dbPath(): string {
    return this.config.dbPath;
  }

  /**
   * Check if the database is currently connected
   */
  public get isConnected(): boolean {
    return this.db !== null;
  }
}
