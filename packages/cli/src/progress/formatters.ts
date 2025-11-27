/**
 * Output formatting utilities
 */

import chalk from 'chalk';

import type { ChessBeastConfig } from '../config/schema.js';

/**
 * Format configuration for display
 */
export function formatConfigDisplay(config: ChessBeastConfig): string {
  const lines: string[] = [];

  lines.push(chalk.bold('Configuration:'));
  lines.push('');

  // Analysis
  lines.push(chalk.dim('Analysis:'));
  lines.push(`  Profile: ${config.analysis.profile}`);
  lines.push(`  Shallow depth: ${config.analysis.shallowDepth}`);
  lines.push(`  Deep depth: ${config.analysis.deepDepth}`);
  lines.push(`  Multi-PV: ${config.analysis.multiPvCount}`);
  lines.push(`  Max critical ratio: ${config.analysis.maxCriticalRatio}`);
  if (config.analysis.skipMaia) {
    lines.push(`  Skip Maia: ${chalk.yellow('yes')}`);
  }
  if (config.analysis.skipLlm) {
    lines.push(`  Skip LLM: ${chalk.yellow('yes')}`);
  }
  lines.push('');

  // Ratings
  lines.push(chalk.dim('Ratings:'));
  lines.push(`  Default rating: ${config.ratings.defaultRating}`);
  if (config.ratings.targetAudienceRating) {
    lines.push(`  Target audience: ${config.ratings.targetAudienceRating}`);
  }
  lines.push('');

  // LLM
  lines.push(chalk.dim('LLM:'));
  lines.push(`  Model: ${config.llm.model}`);
  lines.push(`  API key: ${config.llm.apiKey ? chalk.green('set') : chalk.yellow('not set')}`);
  lines.push('');

  // Services
  lines.push(chalk.dim('Services:'));
  lines.push(`  Stockfish: ${config.services.stockfish.host}:${config.services.stockfish.port}`);
  lines.push(`  Maia: ${config.services.maia.host}:${config.services.maia.port}`);
  lines.push('');

  // Databases
  lines.push(chalk.dim('Databases:'));
  lines.push(`  ECO: ${config.databases.ecoPath}`);
  lines.push(`  Lichess Elite: ${config.databases.lichessPath}`);
  lines.push('');

  // Output
  lines.push(chalk.dim('Output:'));
  lines.push(`  Verbosity: ${config.output.verbosity}`);
  lines.push(`  Include variations: ${config.output.includeVariations}`);
  lines.push(`  Include NAGs: ${config.output.includeNags}`);
  lines.push(`  Include summary: ${config.output.includeSummary}`);

  return lines.join('\n');
}

/**
 * Format a time duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format a file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
