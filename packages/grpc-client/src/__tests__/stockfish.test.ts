import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { StockfishClient, DEFAULT_STOCKFISH_CONFIG } from '../clients/stockfish.js';

describe('StockfishClient', () => {
  let client: StockfishClient;

  beforeEach(() => {
    client = new StockfishClient();
  });

  afterEach(() => {
    client.close();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      expect(client.address).toBe('localhost:50051');
    });

    it('should use custom host when provided', () => {
      const customClient = new StockfishClient({
        host: 'stockfish-server',
      });
      expect(customClient.address).toBe('stockfish-server:50051');
      customClient.close();
    });

    it('should use custom port when provided', () => {
      const customClient = new StockfishClient({
        port: 9000,
      });
      expect(customClient.address).toBe('localhost:9000');
      customClient.close();
    });

    it('should use full custom config when provided', () => {
      const customClient = new StockfishClient({
        host: 'stockfish-server',
        port: 9000,
        timeoutMs: 120000,
      });
      expect(customClient.address).toBe('stockfish-server:9000');
      customClient.close();
    });
  });

  describe('DEFAULT_STOCKFISH_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_STOCKFISH_CONFIG.host).toBe('localhost');
      expect(DEFAULT_STOCKFISH_CONFIG.port).toBe(50051);
      expect(DEFAULT_STOCKFISH_CONFIG.timeoutMs).toBe(60000);
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
