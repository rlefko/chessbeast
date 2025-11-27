/**
 * Output validation for LLM responses
 */

import { ValidationError } from '../errors.js';

import { validateMoveReferences, sanitizeMoveReferences } from './move-validator.js';
import { filterValidNags } from './nag-validator.js';

/**
 * Generated comment from LLM
 */
export interface GeneratedComment {
  /** The annotation comment (undefined = no comment, silence is better than generic text) */
  comment: string | undefined;
  /** NAG symbols */
  nags: string[];
}

/**
 * Generated game summary from LLM
 */
export interface GeneratedSummary {
  /** Opening synopsis */
  openingSynopsis: string | undefined;
  /** Narrative of the game */
  gameNarrative: string;
  /** Key moments in the game */
  keyMoments:
    | Array<{
        moveNumber: number;
        description: string;
      }>
    | undefined;
  /** Lessons learned from the game */
  lessonsLearned: string[];
}

/**
 * Validation issue
 */
export interface ValidationIssue {
  /** Field with the issue */
  field: string;
  /** Issue description */
  message: string;
  /** Severity level */
  severity: 'error' | 'warning';
}

/**
 * Validation result
 */
export interface ValidationResult<T> {
  /** Whether validation passed (no errors, warnings OK) */
  valid: boolean;
  /** Validation issues found */
  issues: ValidationIssue[];
  /** Sanitized/fixed output */
  sanitized: T;
}

/**
 * Parse JSON response from LLM
 */
export function parseJsonResponse<T>(response: string): T {
  try {
    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new ValidationError('No JSON object found in response', 'response', response);
    }
    return JSON.parse(jsonMatch[0]) as T;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(
      `Invalid JSON: ${error instanceof Error ? error.message : 'parse error'}`,
      'response',
      response,
    );
  }
}

/**
 * Validate and sanitize a generated comment
 */
export function validateComment(
  raw: unknown,
  legalMoves: string[],
): ValidationResult<GeneratedComment> {
  const issues: ValidationIssue[] = [];
  const obj = raw as Record<string, unknown>;

  // Extract comment
  let comment = '';
  if (typeof obj['comment'] === 'string') {
    comment = obj['comment'];
  } else if (typeof obj['mainComment'] === 'string') {
    comment = obj['mainComment'];
  } else {
    issues.push({
      field: 'comment',
      message: 'Missing or invalid comment field',
      severity: 'error',
    });
  }

  // Extract and validate NAGs
  let nags: string[] = [];
  if (Array.isArray(obj['nags'])) {
    const rawNags = obj['nags'].filter((n): n is string => typeof n === 'string');
    nags = filterValidNags(rawNags);
    if (rawNags.length !== nags.length) {
      issues.push({
        field: 'nags',
        message: `Filtered ${rawNags.length - nags.length} invalid NAG(s)`,
        severity: 'warning',
      });
    }
  }

  // Validate move references in comment
  if (comment && legalMoves.length > 0) {
    const moveValidation = validateMoveReferences(comment, legalMoves);
    if (moveValidation.hasHallucinations) {
      issues.push({
        field: 'comment',
        message: `Found ${moveValidation.hallucinations.length} potentially hallucinated move(s): ${moveValidation.hallucinations.join(', ')}`,
        severity: 'warning',
      });
      // Sanitize hallucinated moves
      comment = sanitizeMoveReferences(comment, moveValidation.hallucinations);
    }
  }

  // Check comment length
  if (comment.length > 2000) {
    issues.push({
      field: 'comment',
      message: 'Comment exceeds maximum length (2000 chars), truncating',
      severity: 'warning',
    });
    comment = comment.slice(0, 2000) + '...';
  }

  // Sanitize PGN special characters
  comment = sanitizePgnComment(comment);

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    valid: !hasErrors,
    issues,
    sanitized: { comment, nags },
  };
}

/**
 * Validate and sanitize a generated summary
 */
export function validateSummary(raw: unknown): ValidationResult<GeneratedSummary> {
  const issues: ValidationIssue[] = [];
  const obj = raw as Record<string, unknown>;

  // Extract game narrative (required)
  let gameNarrative = '';
  if (typeof obj['gameNarrative'] === 'string') {
    gameNarrative = obj['gameNarrative'];
  } else {
    issues.push({
      field: 'gameNarrative',
      message: 'Missing or invalid gameNarrative field',
      severity: 'error',
    });
  }

  // Extract opening synopsis (optional)
  let openingSynopsis: string | undefined;
  if (typeof obj['openingSynopsis'] === 'string') {
    openingSynopsis = obj['openingSynopsis'];
  }

  // Extract key moments (optional)
  let keyMoments: Array<{ moveNumber: number; description: string }> | undefined;
  if (Array.isArray(obj['keyMoments'])) {
    keyMoments = obj['keyMoments']
      .filter(
        (m): m is { moveNumber: number; description: string } =>
          typeof m === 'object' &&
          m !== null &&
          typeof (m as Record<string, unknown>)['moveNumber'] === 'number' &&
          typeof (m as Record<string, unknown>)['description'] === 'string',
      )
      .slice(0, 5); // Limit to 5 moments
  }

  // Extract lessons (required)
  let lessonsLearned: string[] = [];
  if (Array.isArray(obj['lessonsLearned'])) {
    lessonsLearned = obj['lessonsLearned']
      .filter((l): l is string => typeof l === 'string' && l.length > 0)
      .slice(0, 3); // Limit to 3 lessons

    if (lessonsLearned.length === 0) {
      issues.push({
        field: 'lessonsLearned',
        message: 'No valid lessons found',
        severity: 'error',
      });
    }
  } else {
    issues.push({
      field: 'lessonsLearned',
      message: 'Missing or invalid lessonsLearned field',
      severity: 'error',
    });
  }

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    valid: !hasErrors,
    issues,
    sanitized: {
      openingSynopsis,
      gameNarrative,
      keyMoments,
      lessonsLearned,
    },
  };
}

/**
 * Sanitize text for PGN comment format
 * PGN comments use { } delimiters, so these must be escaped
 */
export function sanitizePgnComment(text: string): string {
  return text.replace(/\{/g, '(').replace(/\}/g, ')').replace(/\\/g, '').replace(/\n/g, ' ').trim();
}

/**
 * Extract chess moves mentioned in a comment that are legal in the position
 *
 * This helps identify moves the LLM discusses that could be shown as variations.
 * For example, "Bxf7+ wins the queen" should show Bxf7+ as a variation.
 *
 * @param comment - The annotation comment to search
 * @param legalMoves - List of legal moves in the position
 * @returns Array of legal moves mentioned in the comment
 */
export function extractMentionedMoves(comment: string, legalMoves: string[]): string[] {
  if (!comment || legalMoves.length === 0) {
    return [];
  }

  // Pattern matches common SAN notation:
  // - Piece moves: Nf3, Bxe5, Qh7+, Rxd8#
  // - Pawn moves: e4, exd5, e8=Q
  // - Castling: O-O, O-O-O
  const sanPattern = /\b([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?)\b/g;

  const matches = comment.match(sanPattern) ?? [];

  // Filter to only legal moves, remove duplicates
  const legalSet = new Set(legalMoves);
  const mentionedMoves = [...new Set(matches)].filter((m) => legalSet.has(m));

  return mentionedMoves;
}
