/**
 * Error classes for database operations
 */

/**
 * Base error class for database errors
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly dbPath?: string,
  ) {
    super(message);
    this.name = 'DatabaseError';
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DatabaseError);
    }
  }
}

/**
 * Error thrown when database file is not found
 */
export class DatabaseNotFoundError extends DatabaseError {
  constructor(dbPath: string) {
    super(`Database file not found: ${dbPath}`, dbPath);
    this.name = 'DatabaseNotFoundError';
  }
}

/**
 * Error thrown when a database query fails
 */
export class QueryError extends DatabaseError {
  constructor(
    message: string,
    public readonly query?: string,
  ) {
    super(message);
    this.name = 'QueryError';
  }
}

/**
 * Error thrown when database connection fails
 */
export class ConnectionError extends DatabaseError {
  constructor(dbPath: string, cause?: Error) {
    super(`Failed to connect to database at ${dbPath}${cause ? `: ${cause.message}` : ''}`, dbPath);
    this.name = 'ConnectionError';
  }
}
