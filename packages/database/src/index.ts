/**
 * @chessbeast/database - Database clients for ChessBeast
 *
 * This package provides clients for:
 * - ECO opening classification database
 * - Lichess Elite reference games database
 */

export const VERSION = '0.1.0';

// Re-export clients
export {
  BaseDatabaseClient,
  EcoClient,
  LichessEliteClient,
  DEFAULT_ECO_CONFIG,
  DEFAULT_LICHESS_CONFIG,
  type DatabaseClientConfig,
} from './clients/index.js';

// Re-export types
export type {
  // Opening types
  OpeningInfo,
  OpeningLookupResult,
  // Reference game types
  ReferenceGame,
  ReferenceGameResult,
} from './types/index.js';

// Re-export utilities
export { hashFen, normalizeFen, unhashFen } from './utils/index.js';

// Re-export errors
export {
  DatabaseError,
  DatabaseNotFoundError,
  QueryError,
  ConnectionError,
} from './errors.js';
