/**
 * CLI-specific error classes
 */

import * as path from 'node:path';

/**
 * Resolve a path to absolute for clearer error messages
 */
export function resolveAbsolutePath(filePath: string): string {
  return path.resolve(process.cwd(), filePath);
}

/**
 * Base CLI error class
 */
export class CliError extends Error {
  constructor(
    message: string,
    public readonly suggestion?: string,
    public readonly exitCode: number = 1,
  ) {
    super(message);
    this.name = 'CliError';
  }

  /**
   * Format error for CLI display
   */
  format(): string {
    const lines = [`Error: ${this.message}`];
    if (this.suggestion) {
      lines.push('');
      lines.push(`Suggestion: ${this.suggestion}`);
    }
    return lines.join('\n');
  }
}

/**
 * Configuration error
 */
export class ConfigError extends CliError {
  constructor(message: string, suggestion?: string) {
    super(message, suggestion);
    this.name = 'ConfigError';
  }
}

/**
 * Input file error
 */
export class InputError extends CliError {
  constructor(message: string, suggestion?: string) {
    super(message, suggestion);
    this.name = 'InputError';
  }
}

/**
 * Output file error
 */
export class OutputError extends CliError {
  constructor(message: string, suggestion?: string) {
    super(message, suggestion);
    this.name = 'OutputError';
  }
}

/**
 * Service connection error
 */
export class ServiceError extends CliError {
  constructor(
    public readonly serviceName: string,
    message: string,
    suggestion?: string,
  ) {
    super(message, suggestion);
    this.name = 'ServiceError';
  }

  override format(): string {
    const lines = [`Error [${this.serviceName}]: ${this.message}`];
    if (this.suggestion) {
      lines.push('');
      lines.push(`Suggestion: ${this.suggestion}`);
    }
    return lines.join('\n');
  }
}

/**
 * Analysis pipeline error
 */
export class AnalysisError extends CliError {
  constructor(message: string, suggestion?: string) {
    super(message, suggestion);
    this.name = 'AnalysisError';
  }
}

/**
 * PGN parse error wrapper
 */
export class PgnError extends CliError {
  constructor(
    message: string,
    public readonly line?: number,
    public readonly column?: number,
  ) {
    super(message);
    this.name = 'PgnError';
  }

  override format(): string {
    const location =
      this.line !== undefined
        ? ` (line ${this.line}${this.column !== undefined ? `, column ${this.column}` : ''})`
        : '';
    return `PGN Parse Error${location}: ${this.message}`;
  }
}
