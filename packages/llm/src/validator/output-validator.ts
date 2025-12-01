/**
 * Output validation for LLM responses
 */

import { ValidationError } from '../errors.js';
import { COMMENT_LIMITS, type CommentType } from '../explorer/types.js';

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
 * Context for move notation stripping
 */
export interface CommentValidationContext {
  /** The move notation being commented on (e.g., "Nf3", "e4") */
  moveNotation?: string;
}

/**
 * Strip move notation repetition from comment
 *
 * LLMs often repeat the move notation in their comments like:
 * "Nf3 develops the knight" - we want just "Develops the knight"
 *
 * Also strips verbose patterns like "The move Nf3" or "a7a6"
 */
function stripMoveRepetition(comment: string, moveNotation?: string): string {
  if (!moveNotation || !comment) return comment;

  // Strip exact move notation at start of comment
  const startPattern = new RegExp(`^${escapeRegex(moveNotation)}\\s*`, 'i');
  comment = comment.replace(startPattern, '');

  // Strip "The move X" pattern
  const themovePattern = new RegExp(`\\bthe move ${escapeRegex(moveNotation)}\\b`, 'gi');
  comment = comment.replace(themovePattern, '');

  // Strip redundant move references like "a7a6" (wrong notation style)
  // This catches when LLM uses long algebraic instead of SAN
  const longAlgPattern = /\b[a-h][1-8][a-h][1-8]\b/gi;
  comment = comment.replace(longAlgPattern, '');

  // Clean up any double spaces or leading/trailing spaces
  return comment.replace(/\s+/g, ' ').trim();
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Note: Sentence-based limits (countSentences, truncateToSentences, MAX_SENTENCES)
// were removed in favor of character limits from COMMENT_LIMITS, which are
// enforced directly in validateComment() for consistency with exploration comments.

/**
 * Regex patterns to match centipawn/evaluation values in text
 * These should NOT appear in human-readable output
 */
const CENTIPAWN_PATTERNS = [
  // Numeric patterns: +150cp, -2.3cp, 150 cp, 300 centipawns
  /[+-]?\d+(?:\.\d+)?\s*(?:cp|centipawn|centipawns)\b/gi,
  // Eval notation: +1.5, -0.3, +2.00 (standalone, not part of move like e4)
  // Negative lookbehind ensures we don't match file letters (a-h)
  /(?<![a-h])[+-]\d+\.\d+(?![0-9])/g,
  // Raw centipawn mentions without numbers
  /\b(?:centipawn|centipawns|cp loss|cp gain)\b/gi,
  // Evaluation swing language with numbers
  /\bevaluation?\s*(?:swing|change|drop|gain)?\s*(?:of\s*)?[+-]?\d+/gi,
  // Stockfish-style eval: (eval: +1.5), [+0.8], etc.
  /\(?\s*eval(?:uation)?:?\s*[+-]?\d+(?:\.\d+)?\s*\)?/gi,
  // Pawns notation: ~0.38 pawns, 2 pawns
  /[~≈]?\s*[+-]?\d+(?:\.\d+)?\s*pawns?\b/gi,
];

/**
 * Strip centipawn and numeric evaluation patterns from comment text
 *
 * LLMs sometimes include evaluation numbers despite being told not to.
 * This post-processes the output to remove any that slip through.
 */
export function stripCentipawnPatterns(comment: string): string {
  let result = comment;

  for (const pattern of CENTIPAWN_PATTERNS) {
    result = result.replace(pattern, '');
  }

  // Clean up any double spaces or leading/trailing spaces left behind
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Meta-content patterns that slip through prompts
 * These make the annotation sound robotic or self-referential
 */
const META_CONTENT_PATTERNS = [
  // Headers and summaries
  /^Summary\s*\([^)]+\):\s*/i,
  /^Concrete idea:\s*/i,
  /^Practical takeaway:\s*/i,
  /^Why .+ is (bad|good|inaccurate):\s*/i,

  // Self-referential and filler starters
  /^(?:As (?:noted|mentioned|shown|demonstrated)),?\s*/i,
  /^(?:Interestingly|Importantly|Notably|Clearly|Obviously),?\s*/i,
  /^(?:It (?:is|should be) (?:worth )?not(?:ed|ing) that)\s*/i,
  /^(?:Let me (?:explain|analyze))\s*/i,
  /^(?:Upon|After) analysis,?\s*/i,

  // Classification echoes (NAG shows this)
  /^This (?:is |move is )?(?:a )?(?:mistake|blunder|inaccuracy)[.,]?\s*/i,
  /^(?:A )?(?:Costly|Serious|Critical|Fatal|Terrible) (?:mistake|blunder)[.,]?\s*/i,
];

/**
 * Strip meta-content patterns that make annotations sound robotic
 *
 * Note: Does NOT auto-capitalize. Explorer uses lowercase comments for
 * "show don't tell" style, so we preserve the original case.
 */
export function stripMetaContent(comment: string): string {
  let result = comment;

  for (const pattern of META_CONTENT_PATTERNS) {
    result = result.replace(pattern, '');
  }

  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Validate and sanitize a generated comment
 *
 * @param raw - Raw LLM response to validate
 * @param legalMoves - Legal moves in position for hallucination detection
 * @param context - Additional context for validation
 * @param commentType - Type of comment for character limit enforcement (default: 'initial')
 */
export function validateComment(
  raw: unknown,
  legalMoves: string[],
  context?: CommentValidationContext,
  commentType: CommentType = 'initial',
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

  // Strip move notation repetition from comment
  if (comment && context?.moveNotation) {
    const originalLength = comment.length;
    comment = stripMoveRepetition(comment, context.moveNotation);
    if (comment.length !== originalLength) {
      issues.push({
        field: 'comment',
        message: 'Stripped repeated move notation from comment',
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

  // Strip centipawn patterns (LLMs sometimes include these despite being told not to)
  if (comment) {
    const beforeStrip = comment;
    comment = stripCentipawnPatterns(comment);
    if (comment !== beforeStrip) {
      issues.push({
        field: 'comment',
        message: 'Stripped numeric evaluation patterns from comment',
        severity: 'warning',
      });
    }
  }

  // Strip meta-content patterns (headers, filler phrases)
  if (comment) {
    const beforeStrip = comment;
    comment = stripMetaContent(comment);
    if (comment !== beforeStrip) {
      issues.push({
        field: 'comment',
        message: 'Stripped meta-content patterns from comment',
        severity: 'warning',
      });
    }
  }

  // Enforce character limits (consistent with exploration comments)
  if (comment) {
    const limits = COMMENT_LIMITS[commentType];

    // Hard limit: truncate at last complete word before limit
    if (comment.length > limits.hard) {
      const truncated = comment.slice(0, limits.hard).replace(/\s+\S*$/, '').trim();
      issues.push({
        field: 'comment',
        message: `Comment exceeds ${limits.hard} chars (${comment.length}), truncating`,
        severity: 'warning',
      });
      comment = truncated || comment.slice(0, limits.hard);
    }

    // Soft limit: warn but don't truncate
    if (comment.length > limits.soft && comment.length <= limits.hard) {
      issues.push({
        field: 'comment',
        message: `Comment is ${comment.length} chars (soft limit: ${limits.soft})`,
        severity: 'warning',
      });
    }
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
