/**
 * JSON Schemas for Agent Card Validation
 *
 * Provides JSON Schema definitions for validating agent cards
 * and related input structures before LLM processing.
 */

/**
 * JSON Schema type definition
 */
export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: (string | number | boolean)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean | JSONSchema;
  description?: string;
  default?: unknown;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  $ref?: string;
  definitions?: Record<string, JSONSchema>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Validation errors if any */
  errors: ValidationError[];
}

/**
 * Validation error
 */
export interface ValidationError {
  /** Path to the invalid property */
  path: string;

  /** Error message */
  message: string;

  /** Expected value/type */
  expected?: string;

  /** Actual value/type */
  actual?: string;
}

/**
 * Compact evaluation schema
 */
export const COMPACT_EVAL_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    cp: {
      type: 'number',
      description: 'Centipawn evaluation',
    },
    mate: {
      type: 'number',
      description: 'Mate in N (positive = winning, negative = losing)',
    },
  },
  additionalProperties: false,
};

/**
 * WDL schema
 */
export const WDL_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    win: { type: 'number', minimum: 0, maximum: 100 },
    draw: { type: 'number', minimum: 0, maximum: 100 },
    loss: { type: 'number', minimum: 0, maximum: 100 },
  },
  required: ['win', 'draw', 'loss'],
  additionalProperties: false,
};

/**
 * Theme delta summary schema
 */
export const THEME_DELTA_SUMMARY_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', description: 'Theme type' },
    category: {
      type: 'string',
      enum: ['tactical', 'structural', 'positional', 'dynamic'],
    },
    beneficiary: { type: 'string', enum: ['w', 'b'] },
    square: { type: 'string', minLength: 2, maxLength: 2 },
    severity: {
      type: 'string',
      enum: ['critical', 'significant', 'moderate', 'minor'],
    },
    transition: {
      type: 'string',
      enum: ['emerged', 'persisting', 'escalated', 'resolved', 'transformed'],
    },
    materialAtStake: { type: 'number' },
    explanation: { type: 'string' },
  },
  required: ['type', 'category', 'beneficiary', 'square', 'severity', 'transition', 'explanation'],
  additionalProperties: false,
};

/**
 * Candidate summary schema
 */
export const CANDIDATE_SUMMARY_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    san: { type: 'string', description: 'Move in SAN notation' },
    evalCp: { type: 'number', description: 'Evaluation in centipawns' },
    mate: { type: 'number', description: 'Mate in N' },
    source: {
      type: 'string',
      enum: [
        'engine_best',
        'near_best',
        'human_popular',
        'maia_preferred',
        'attractive_but_bad',
        'sacrifice',
        'scary_check',
        'scary_capture',
        'quiet_improvement',
        'blunder',
      ],
    },
    reason: { type: 'string' },
    humanProb: { type: 'number', minimum: 0, maximum: 1 },
    pvPreview: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 5,
    },
  },
  required: ['san', 'evalCp', 'source', 'reason'],
  additionalProperties: false,
};

/**
 * Parent delta schema
 */
export const PARENT_DELTA_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    move: { type: 'string' },
    evalChange: { type: 'number' },
    winProbChange: { type: 'number' },
  },
  required: ['move', 'evalChange', 'winProbChange'],
  additionalProperties: false,
};

/**
 * Line context snapshot schema
 */
export const LINE_CONTEXT_SNAPSHOT_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    ply: { type: 'number', minimum: 0 },
    recentSummary: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 10,
    },
    focus: { type: 'string' },
    evalTrend: {
      type: 'string',
      enum: ['improving', 'declining', 'stable'],
    },
    unexplainedThemeCount: { type: 'number', minimum: 0 },
  },
  required: ['ply', 'recentSummary', 'evalTrend', 'unexplainedThemeCount'],
  additionalProperties: false,
};

/**
 * Output constraints schema
 */
export const OUTPUT_CONSTRAINTS_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    maxWords: { type: 'number', minimum: 10, maximum: 200 },
    style: {
      type: 'string',
      enum: ['concise', 'explanatory', 'didactic'],
    },
    audience: {
      type: 'string',
      enum: ['beginner', 'club', 'expert'],
    },
    includeVariations: { type: 'boolean' },
    showEvaluations: { type: 'boolean' },
  },
  required: ['maxWords', 'style', 'audience', 'includeVariations', 'showEvaluations'],
  additionalProperties: false,
};

/**
 * Agent card schema
 */
export const AGENT_CARD_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    positionKey: { type: 'string' },
    fen: { type: 'string' },
    ply: { type: 'number', minimum: 0 },
    sideToMove: { type: 'string', enum: ['w', 'b'] },
    eval: COMPACT_EVAL_SCHEMA,
    wdl: WDL_SCHEMA,
    nag: { type: 'string' },
    criticalityScore: { type: 'number', minimum: 0, maximum: 100 },
    parentDelta: PARENT_DELTA_SCHEMA,
    themeDeltas: {
      type: 'array',
      items: THEME_DELTA_SUMMARY_SCHEMA,
      maxItems: 5,
    },
    candidates: {
      type: 'array',
      items: CANDIDATE_SUMMARY_SCHEMA,
      maxItems: 6,
    },
    lineContext: LINE_CONTEXT_SNAPSHOT_SCHEMA,
    constraints: OUTPUT_CONSTRAINTS_SCHEMA,
  },
  required: [
    'positionKey',
    'fen',
    'ply',
    'sideToMove',
    'eval',
    'criticalityScore',
    'themeDeltas',
    'candidates',
    'lineContext',
    'constraints',
  ],
  additionalProperties: false,
};

/**
 * Narrator role input schema
 */
export const NARRATOR_INPUT_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    intent: {
      type: 'object',
      description: 'Comment intent to narrate',
      additionalProperties: true,
    },
    card: AGENT_CARD_SCHEMA,
    previousComments: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 5,
    },
    style: {
      type: 'string',
      enum: ['concise', 'explanatory', 'didactic'],
    },
  },
  required: ['intent', 'card', 'previousComments', 'style'],
  additionalProperties: false,
};

/**
 * Tiebreaker input schema
 */
export const TIEBREAKER_INPUT_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    card: AGENT_CARD_SCHEMA,
    topCandidates: {
      type: 'array',
      items: CANDIDATE_SUMMARY_SCHEMA,
      minItems: 2,
      maxItems: 3,
    },
    question: { type: 'string' },
  },
  required: ['card', 'topCandidates', 'question'],
  additionalProperties: false,
};

/**
 * Didactic input schema
 */
export const DIDACTIC_INPUT_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    originalComment: { type: 'string' },
    card: AGENT_CARD_SCHEMA,
    targetAudience: {
      type: 'string',
      enum: ['beginner', 'club', 'expert'],
    },
    complexTerms: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['originalComment', 'card', 'targetAudience'],
  additionalProperties: false,
};

/**
 * Simple JSON schema validator
 *
 * Provides basic validation without external dependencies.
 * For production use, consider using a full schema validator like Ajv.
 */
export function validateAgainstSchema(
  data: unknown,
  schema: JSONSchema,
  path: string = '',
): ValidationResult {
  const errors: ValidationError[] = [];

  // Type check
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = getType(data);

    if (!types.includes(actualType)) {
      errors.push({
        path: path || 'root',
        message: `Expected type ${types.join(' or ')}, got ${actualType}`,
        expected: types.join(' or '),
        actual: actualType,
      });
      return { valid: false, errors };
    }
  }

  // Null check
  if (data === null || data === undefined) {
    if (schema.type !== undefined && !schema.type.includes('null' as never)) {
      errors.push({
        path: path || 'root',
        message: 'Value cannot be null or undefined',
      });
    }
    return { valid: errors.length === 0, errors };
  }

  // Enum check
  if (schema.enum !== undefined) {
    if (!schema.enum.includes(data as never)) {
      errors.push({
        path: path || 'root',
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        expected: schema.enum.join(', '),
        actual: String(data),
      });
    }
  }

  // Number constraints
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({
        path: path || 'root',
        message: `Value must be >= ${schema.minimum}`,
        expected: `>= ${schema.minimum}`,
        actual: String(data),
      });
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({
        path: path || 'root',
        message: `Value must be <= ${schema.maximum}`,
        expected: `<= ${schema.maximum}`,
        actual: String(data),
      });
    }
  }

  // String constraints
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({
        path: path || 'root',
        message: `String length must be >= ${schema.minLength}`,
      });
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({
        path: path || 'root',
        message: `String length must be <= ${schema.maxLength}`,
      });
    }
  }

  // Array constraints
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({
        path: path || 'root',
        message: `Array must have >= ${schema.minItems} items`,
      });
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push({
        path: path || 'root',
        message: `Array must have <= ${schema.maxItems} items`,
      });
    }

    // Validate array items
    if (schema.items !== undefined) {
      for (let i = 0; i < data.length; i++) {
        const itemResult = validateAgainstSchema(data[i], schema.items, `${path}[${i}]`);
        errors.push(...itemResult.errors);
      }
    }
  }

  // Object validation
  if (typeof data === 'object' && !Array.isArray(data) && data !== null) {
    const obj = data as Record<string, unknown>;

    // Required properties
    if (schema.required !== undefined) {
      for (const prop of schema.required) {
        if (!(prop in obj)) {
          errors.push({
            path: path ? `${path}.${prop}` : prop,
            message: `Required property '${prop}' is missing`,
          });
        }
      }
    }

    // Property validation
    if (schema.properties !== undefined) {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        if (prop in obj) {
          const propResult = validateAgainstSchema(
            obj[prop],
            propSchema,
            path ? `${path}.${prop}` : prop,
          );
          errors.push(...propResult.errors);
        }
      }
    }

    // Additional properties check
    if (schema.additionalProperties === false && schema.properties !== undefined) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const prop of Object.keys(obj)) {
        if (!allowed.has(prop)) {
          errors.push({
            path: path ? `${path}.${prop}` : prop,
            message: `Additional property '${prop}' is not allowed`,
          });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get the JSON type of a value
 */
function getType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Validate an agent card
 */
export function validateAgentCard(card: unknown): ValidationResult {
  return validateAgainstSchema(card, AGENT_CARD_SCHEMA);
}

/**
 * Validate narrator input
 */
export function validateNarratorInput(input: unknown): ValidationResult {
  return validateAgainstSchema(input, NARRATOR_INPUT_SCHEMA);
}

/**
 * Validate tiebreaker input
 */
export function validateTiebreakerInput(input: unknown): ValidationResult {
  return validateAgainstSchema(input, TIEBREAKER_INPUT_SCHEMA);
}

/**
 * Validate didactic input
 */
export function validateDidacticInput(input: unknown): ValidationResult {
  return validateAgainstSchema(input, DIDACTIC_INPUT_SCHEMA);
}
