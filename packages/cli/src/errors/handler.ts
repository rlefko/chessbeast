/**
 * Error handling utilities
 */

import chalk from 'chalk';

import { ConfigValidationError } from '../config/validation.js';

import { CliError, ServiceError } from './cli-errors.js';

/**
 * Format and display an error for CLI output
 */
export function formatError(error: unknown): string {
  if (error instanceof ConfigValidationError) {
    return chalk.red(error.format());
  }

  if (error instanceof CliError) {
    return chalk.red(error.format());
  }

  if (error instanceof Error) {
    return chalk.red(`Error: ${error.message}`);
  }

  return chalk.red(`Error: ${String(error)}`);
}

/**
 * Handle an error and exit with appropriate code
 */
export function handleError(error: unknown): never {
  console.error(formatError(error));

  let exitCode = 1;
  if (error instanceof CliError) {
    exitCode = error.exitCode;
  }

  process.exit(exitCode);
}

/**
 * Wrap an async function with error handling
 */
export function withErrorHandling<T extends unknown[]>(
  fn: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (error) {
      handleError(error);
    }
  };
}

/**
 * Create a service error with helpful suggestion
 */
export function createServiceError(
  serviceName: string,
  host: string,
  port: number,
  originalError?: Error,
): ServiceError {
  const suggestions: Record<string, string> = {
    Stockfish: `Run 'make run-stockfish' to start the Stockfish service`,
    Maia: `Run 'make run-maia' to start the Maia service`,
    'OpenAI API': `Set the OPENAI_API_KEY environment variable`,
    'ECO Database': `Run 'make setup' to download and set up the databases`,
    'Lichess Database': `Run 'make setup' to download and set up the databases`,
  };

  const message = `Service unavailable at ${host}:${port}${originalError ? ` (${originalError.message})` : ''}`;
  const suggestion = suggestions[serviceName];

  return new ServiceError(serviceName, message, suggestion);
}
