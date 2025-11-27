import { describe, it, expect } from 'vitest';

import { LichessEliteClient, DEFAULT_LICHESS_CONFIG } from '../clients/lichess.js';
import { DatabaseNotFoundError } from '../errors.js';

describe('LichessEliteClient', () => {
  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const client = new LichessEliteClient();
      expect(client.dbPath).toBe('lichess_elite.db');
      client.close();
    });

    it('should use custom path when provided', () => {
      const client = new LichessEliteClient({ dbPath: 'custom.db' });
      expect(client.dbPath).toBe('custom.db');
      client.close();
    });

    it('should merge config with defaults', () => {
      const client = new LichessEliteClient({ readonly: false });
      expect(client.dbPath).toBe('lichess_elite.db');
      client.close();
    });
  });

  describe('DEFAULT_LICHESS_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_LICHESS_CONFIG.dbPath).toBe('lichess_elite.db');
      expect(DEFAULT_LICHESS_CONFIG.readonly).toBe(true);
      expect(DEFAULT_LICHESS_CONFIG.timeoutMs).toBe(10000);
    });
  });

  describe('close', () => {
    it('should not throw when closing unconnected client', () => {
      const client = new LichessEliteClient();
      expect(() => client.close()).not.toThrow();
    });

    it('should be safe to call multiple times', () => {
      const client = new LichessEliteClient();
      client.close();
      client.close();
      expect(() => client.close()).not.toThrow();
    });
  });

  describe('isConnected', () => {
    it('should be false before connection', () => {
      const client = new LichessEliteClient();
      expect(client.isConnected).toBe(false);
      client.close();
    });
  });

  describe('getReferenceGames', () => {
    it('should throw DatabaseNotFoundError if database does not exist', () => {
      const client = new LichessEliteClient({ dbPath: 'nonexistent.db' });
      expect(() => client.getReferenceGames('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toThrow(DatabaseNotFoundError);
      client.close();
    });
  });

  describe('getByEco', () => {
    it('should throw DatabaseNotFoundError if database does not exist', () => {
      const client = new LichessEliteClient({ dbPath: 'nonexistent.db' });
      expect(() => client.getByEco('B90')).toThrow(DatabaseNotFoundError);
      client.close();
    });
  });

  describe('getByPlayer', () => {
    it('should throw DatabaseNotFoundError if database does not exist', () => {
      const client = new LichessEliteClient({ dbPath: 'nonexistent.db' });
      expect(() => client.getByPlayer('Carlsen')).toThrow(DatabaseNotFoundError);
      client.close();
    });
  });

  describe('getTotalGameCount', () => {
    it('should throw DatabaseNotFoundError if database does not exist', () => {
      const client = new LichessEliteClient({ dbPath: 'nonexistent.db' });
      expect(() => client.getTotalGameCount()).toThrow(DatabaseNotFoundError);
      client.close();
    });
  });

  // Integration tests would require a real database
  // They would be added in a separate integration test file
});
