import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { MaiaClient, DEFAULT_MAIA_CONFIG } from '../clients/maia.js';

describe('MaiaClient', () => {
  let client: MaiaClient;

  beforeEach(() => {
    client = new MaiaClient();
  });

  afterEach(() => {
    client.close();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      expect(client.address).toBe('localhost:50052');
    });

    it('should use custom host when provided', () => {
      const customClient = new MaiaClient({
        host: 'maia-server',
      });
      expect(customClient.address).toBe('maia-server:50052');
      customClient.close();
    });

    it('should use custom port when provided', () => {
      const customClient = new MaiaClient({
        port: 9001,
      });
      expect(customClient.address).toBe('localhost:9001');
      customClient.close();
    });

    it('should use full custom config when provided', () => {
      const customClient = new MaiaClient({
        host: 'maia-server',
        port: 9001,
        timeoutMs: 60000,
      });
      expect(customClient.address).toBe('maia-server:9001');
      customClient.close();
    });
  });

  describe('DEFAULT_MAIA_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_MAIA_CONFIG.host).toBe('localhost');
      expect(DEFAULT_MAIA_CONFIG.port).toBe(50052);
      expect(DEFAULT_MAIA_CONFIG.timeoutMs).toBe(30000);
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
