import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Stockfish16Client, DEFAULT_STOCKFISH16_CONFIG } from '../clients/stockfish16.js';

describe('Stockfish16Client', () => {
  let client: Stockfish16Client;

  beforeEach(() => {
    client = new Stockfish16Client();
  });

  afterEach(() => {
    client.close();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      expect(client.address).toBe('localhost:50053');
    });

    it('should use custom host when provided', () => {
      const customClient = new Stockfish16Client({
        host: 'sf16-server',
      });
      expect(customClient.address).toBe('sf16-server:50053');
      customClient.close();
    });

    it('should use custom port when provided', () => {
      const customClient = new Stockfish16Client({
        port: 9000,
      });
      expect(customClient.address).toBe('localhost:9000');
      customClient.close();
    });

    it('should use full custom config when provided', () => {
      const customClient = new Stockfish16Client({
        host: 'sf16-server',
        port: 9000,
        timeoutMs: 60000,
      });
      expect(customClient.address).toBe('sf16-server:9000');
      customClient.close();
    });
  });

  describe('DEFAULT_STOCKFISH16_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_STOCKFISH16_CONFIG.host).toBe('localhost');
      expect(DEFAULT_STOCKFISH16_CONFIG.port).toBe(50053);
      expect(DEFAULT_STOCKFISH16_CONFIG.timeoutMs).toBe(30000); // 30 seconds for fast eval
    });
  });

  describe('close', () => {
    it('should not throw when closing', () => {
      expect(() => client.close()).not.toThrow();
    });

    it('should be safe to call multiple times', () => {
      client.close();
      client.close();
      expect(() => client.close()).not.toThrow();
    });
  });

  // Note: Integration tests for actual gRPC calls require running services
  // These would be in a separate integration test file skipped by default
});
