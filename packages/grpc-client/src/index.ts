/**
 * @chessbeast/grpc-client - gRPC clients for ChessBeast services
 *
 * This package provides TypeScript clients for:
 * - Stockfish service (engine evaluation)
 * - Maia service (human-likeness prediction)
 */

export const VERSION = '0.1.0';

/**
 * Configuration for gRPC service connections
 */
export interface ServiceConfig {
  host: string;
  port: number;
}

/**
 * Default service configuration
 */
export const DEFAULT_STOCKFISH_CONFIG: ServiceConfig = { host: 'localhost', port: 50051 };
export const DEFAULT_MAIA_CONFIG: ServiceConfig = { host: 'localhost', port: 50052 };

/**
 * Placeholder for Stockfish client
 */
export class StockfishClient {
  constructor(private config: ServiceConfig = DEFAULT_STOCKFISH_CONFIG) {
    console.log(`StockfishClient configured for ${this.config.host}:${this.config.port}`);
  }

  async evaluate(_fen: string, _depth: number): Promise<void> {
    console.log('Stockfish evaluation not yet implemented');
  }
}

/**
 * Placeholder for Maia client
 */
export class MaiaClient {
  constructor(private config: ServiceConfig = DEFAULT_MAIA_CONFIG) {
    console.log(`MaiaClient configured for ${this.config.host}:${this.config.port}`);
  }

  async predict(_fen: string, _ratingBand: number): Promise<void> {
    console.log('Maia prediction not yet implemented');
  }
}
