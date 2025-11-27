import { describe, it, expect } from 'vitest';

import { EcoClient, DEFAULT_ECO_CONFIG } from '../clients/eco.js';
import { DatabaseNotFoundError } from '../errors.js';

describe('EcoClient', () => {
  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const client = new EcoClient();
      expect(client.dbPath).toBe('eco.db');
      client.close();
    });

    it('should use custom path when provided', () => {
      const client = new EcoClient({ dbPath: 'custom.db' });
      expect(client.dbPath).toBe('custom.db');
      client.close();
    });

    it('should merge config with defaults', () => {
      const client = new EcoClient({ readonly: false });
      expect(client.dbPath).toBe('eco.db');
      client.close();
    });
  });

  describe('DEFAULT_ECO_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_ECO_CONFIG.dbPath).toBe('eco.db');
      expect(DEFAULT_ECO_CONFIG.readonly).toBe(true);
      expect(DEFAULT_ECO_CONFIG.timeoutMs).toBe(5000);
    });
  });

  describe('close', () => {
    it('should not throw when closing unconnected client', () => {
      const client = new EcoClient();
      expect(() => client.close()).not.toThrow();
    });

    it('should be safe to call multiple times', () => {
      const client = new EcoClient();
      client.close();
      client.close();
      expect(() => client.close()).not.toThrow();
    });
  });

  describe('isConnected', () => {
    it('should be false before connection', () => {
      const client = new EcoClient();
      expect(client.isConnected).toBe(false);
      client.close();
    });
  });

  describe('getOpeningByMoves', () => {
    it('should throw DatabaseNotFoundError if database does not exist', () => {
      const client = new EcoClient({ dbPath: 'nonexistent.db' });
      expect(() => client.getOpeningByMoves(['e2e4'])).toThrow(DatabaseNotFoundError);
      client.close();
    });

    it('should return empty result for empty moves', () => {
      const client = new EcoClient({ dbPath: 'nonexistent.db' });
      // This should not throw because we handle empty moves before connecting
      const result = client.getOpeningByMoves([]);
      expect(result.matchedPlies).toBe(0);
      expect(result.isExactMatch).toBe(false);
      client.close();
    });
  });

  describe('getByEco', () => {
    it('should throw DatabaseNotFoundError if database does not exist', () => {
      const client = new EcoClient({ dbPath: 'nonexistent.db' });
      expect(() => client.getByEco('B90')).toThrow(DatabaseNotFoundError);
      client.close();
    });
  });

  describe('getByPosition', () => {
    it('should throw DatabaseNotFoundError if database does not exist', () => {
      const client = new EcoClient({ dbPath: 'nonexistent.db' });
      expect(() => client.getByPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')).toThrow(DatabaseNotFoundError);
      client.close();
    });
  });

  // Integration tests would require a real database
  // They would be added in a separate integration test file
});
