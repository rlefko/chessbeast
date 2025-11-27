import { describe, it, expect } from 'vitest';

import { DatabaseError, DatabaseNotFoundError, QueryError, ConnectionError } from '../errors.js';

describe('Error Classes', () => {
  describe('DatabaseError', () => {
    it('should create error with message', () => {
      const error = new DatabaseError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('DatabaseError');
    });

    it('should create error with dbPath', () => {
      const error = new DatabaseError('Test error', '/path/to/db');
      expect(error.dbPath).toBe('/path/to/db');
    });

    it('should be instanceof Error', () => {
      const error = new DatabaseError('Test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DatabaseError);
    });
  });

  describe('DatabaseNotFoundError', () => {
    it('should include path in message', () => {
      const error = new DatabaseNotFoundError('/path/to/eco.db');
      expect(error.message).toContain('/path/to/eco.db');
      expect(error.dbPath).toBe('/path/to/eco.db');
      expect(error.name).toBe('DatabaseNotFoundError');
    });

    it('should be instanceof DatabaseError', () => {
      const error = new DatabaseNotFoundError('/path/to/db');
      expect(error).toBeInstanceOf(DatabaseError);
    });
  });

  describe('QueryError', () => {
    it('should create with message', () => {
      const error = new QueryError('Query failed');
      expect(error.message).toBe('Query failed');
      expect(error.name).toBe('QueryError');
    });

    it('should include query if provided', () => {
      const error = new QueryError('Query failed', 'SELECT * FROM games');
      expect(error.query).toBe('SELECT * FROM games');
    });

    it('should be instanceof DatabaseError', () => {
      const error = new QueryError('test');
      expect(error).toBeInstanceOf(DatabaseError);
    });
  });

  describe('ConnectionError', () => {
    it('should include path in message', () => {
      const error = new ConnectionError('/path/to/eco.db');
      expect(error.message).toContain('/path/to/eco.db');
      expect(error.name).toBe('ConnectionError');
    });

    it('should include cause message', () => {
      const cause = new Error('SQLITE_CANTOPEN');
      const error = new ConnectionError('/path/to/eco.db', cause);
      expect(error.message).toContain('SQLITE_CANTOPEN');
    });

    it('should be instanceof DatabaseError', () => {
      const error = new ConnectionError('/path/to/db');
      expect(error).toBeInstanceOf(DatabaseError);
    });
  });
});
