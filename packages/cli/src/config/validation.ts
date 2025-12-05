/**
 * Zod validation schemas for configuration
 */

import { z } from 'zod';

/**
 * Port number schema (1-65535)
 */
const portSchema = z.number().int().min(1).max(65535);

/**
 * Ratio schema (0.0-1.0)
 */
const ratioSchema = z.number().min(0).max(1);

/**
 * Engine depth schema (1-99)
 */
const depthSchema = z.number().int().min(1).max(99);

/**
 * Chess rating schema (100-4000)
 */
const ratingSchema = z.number().int().min(100).max(4000);

/**
 * Analysis profile schema
 */
export const analysisProfileSchema = z.enum(['quick', 'standard', 'deep']);

/**
 * Output verbosity schema
 */
export const outputVerbositySchema = z.enum(['summary', 'normal', 'rich']);

/**
 * Service endpoint schema
 */
export const serviceEndpointSchema = z.object({
  host: z.string().min(1),
  port: portSchema,
  timeoutMs: z.number().int().min(1000),
});

/**
 * Base analysis configuration schema (without refinement)
 */
const baseAnalysisConfigSchema = z.object({
  profile: analysisProfileSchema,
  shallowDepth: depthSchema,
  deepDepth: depthSchema,
  multiPvCount: z.number().int().min(1).max(10),
  maxCriticalRatio: ratioSchema,
  skipMaia: z.boolean(),
  skipLlm: z.boolean(),
});

/**
 * Analysis configuration schema with validation
 */
export const analysisConfigSchema = baseAnalysisConfigSchema.refine(
  (data) => data.deepDepth >= data.shallowDepth,
  {
    message: 'deepDepth must be >= shallowDepth',
    path: ['deepDepth'],
  },
);

/**
 * Ratings configuration schema
 */
export const ratingsConfigSchema = z.object({
  targetAudienceRating: ratingSchema.optional(),
  defaultRating: ratingSchema,
});

/**
 * LLM configuration schema
 */
export const llmConfigSchema = z.object({
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2),
  timeout: z.number().int().min(1000).max(300000),
});

/**
 * Optional service endpoint schema (with enabled flag)
 */
export const optionalServiceEndpointSchema = z.object({
  host: z.string().min(1).default('localhost'),
  port: portSchema,
  timeoutMs: z.number().int().min(1000).default(30000),
  enabled: z.boolean().default(true),
});

/**
 * Services configuration schema
 */
export const servicesConfigSchema = z.object({
  stockfish: serviceEndpointSchema,
  maia: serviceEndpointSchema,
  stockfish16: optionalServiceEndpointSchema.optional(),
});

/**
 * Databases configuration schema
 */
export const databasesConfigSchema = z.object({
  ecoPath: z.string().min(1),
  lichessPath: z.string().min(1),
});

/**
 * Output configuration schema
 */
export const outputConfigSchema = z.object({
  verbosity: outputVerbositySchema,
  includeVariations: z.boolean(),
  includeNags: z.boolean(),
  includeSummary: z.boolean(),
});

/**
 * Complete configuration schema
 */
export const configSchema = z.object({
  analysis: analysisConfigSchema,
  ratings: ratingsConfigSchema,
  llm: llmConfigSchema,
  services: servicesConfigSchema,
  databases: databasesConfigSchema,
  output: outputConfigSchema,
});

/**
 * Partial configuration schema (for config files)
 */
export const partialConfigSchema = z.object({
  analysis: baseAnalysisConfigSchema.partial().optional(),
  ratings: ratingsConfigSchema.partial().optional(),
  llm: llmConfigSchema.partial().optional(),
  services: z
    .object({
      stockfish: serviceEndpointSchema.partial().optional(),
      maia: serviceEndpointSchema.partial().optional(),
      stockfish16: optionalServiceEndpointSchema.partial().optional(),
    })
    .optional(),
  databases: databasesConfigSchema.partial().optional(),
  output: outputConfigSchema.partial().optional(),
});

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(public readonly errors: Array<{ path: string; message: string }>) {
    const errorMessages = errors.map((e) => `  ${e.path}: ${e.message}`).join('\n');
    super(`Configuration validation failed:\n${errorMessages}`);
    this.name = 'ConfigValidationError';
  }

  /**
   * Format error for CLI display
   */
  format(): string {
    return [
      'Configuration validation failed:',
      '',
      ...this.errors.map((e) => `  ${e.path}: ${e.message}`),
      '',
      'Use --help to see available options',
      'Use --show-config to see current configuration',
    ].join('\n');
  }
}

/**
 * Validate a complete configuration
 * @throws ConfigValidationError if validation fails
 */
export function validateConfig(config: unknown): void {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ConfigValidationError(errors);
  }
}

/**
 * Validate a partial configuration (from config file)
 * @throws ConfigValidationError if validation fails
 */
export function validatePartialConfig(config: unknown): void {
  const result = partialConfigSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ConfigValidationError(errors);
  }
}

export type { z };
