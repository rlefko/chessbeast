/**
 * Error module exports
 */

export {
  CliError,
  ConfigError,
  InputError,
  OutputError,
  ServiceError,
  AnalysisError,
  PgnError,
  resolveAbsolutePath,
} from './cli-errors.js';

export { formatError, handleError, withErrorHandling, createServiceError } from './handler.js';
