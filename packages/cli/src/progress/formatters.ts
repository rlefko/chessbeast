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

/**
 * Format estimated time remaining in human-readable format
 * @param ms Milliseconds remaining, or null if unknown
 * @returns Formatted string like "~2m 30s" or empty string if null
 */
export function formatEta(ms: number | null): string {
  if (ms === null) {
    return '';
  }

  if (ms <= 0) {
    return 'almost done';
  }

  if (ms < 1000) {
    return 'less than a second';
  }

  if (ms < 60000) {
    const seconds = Math.ceil(ms / 1000);
    return `~${seconds}s`;
  }

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.ceil((ms % 60000) / 1000);

  if (seconds === 0) {
    return `~${minutes}m`;
  }

  return `~${minutes}m ${seconds}s`;
}

/**
 * Format a progress bar
 * @param current Current progress value
 * @param total Total progress value
 * @param width Width of the progress bar in characters (default: 20)
 * @returns Formatted progress bar like "[========          ]"
 */
export function formatProgressBar(current: number, total: number, width: number = 20): string {
  if (total <= 0) {
    return `[${'?'.repeat(width)}]`;
  }

  const ratio = Math.min(current / total, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  return `[${'='.repeat(filled)}${' '.repeat(empty)}]`;
}

/**
 * Format a percentage
 * @param current Current progress value
 * @param total Total progress value
 * @returns Formatted percentage like "42%"
 */
export function formatPercentage(current: number, total: number): string {
  if (total <= 0) {
    return '0%';
  }

  const percentage = Math.round((current / total) * 100);
  return `${percentage}%`;
}
