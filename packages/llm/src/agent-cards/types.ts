/**
 * Agent Card Types
 *
 * Compact structured representation of position state for LLM input.
 * Designed to minimize token usage while providing all context needed
 * for comment generation and exploration decisions.
 */

import type { CandidateSource, ThemeCategory, ThemeSeverity } from '@chessbeast/core/storage';

import type { CommentIntent } from '../narration/intents.js';
import type { ThemeStatus } from '../themes/types.js';

/**
 * Compact evaluation representation
 */
export interface CompactEval {
  /** Centipawn evaluation */
  cp?: number;

  /** Mate in N (positive = winning, negative = losing) */
  mate?: number;
}

/**
 * Win/Draw/Loss probabilities
 */
export interface WDL {
  /** Win probability (0-100) */
  win: number;

  /** Draw probability (0-100) */
  draw: number;

  /** Loss probability (0-100) */
  loss: number;
}

/**
 * Summarized theme delta for compact representation
 *
 * Only includes the most relevant fields for LLM context.
 */
export interface ThemeDeltaSummary {
  /** Theme type (e.g., "fork", "pin", "passed_pawn") */
  type: string;

  /** Theme category */
  category: ThemeCategory;

  /** Which side benefits */
  beneficiary: 'w' | 'b';

  /** Primary square involved */
  square: string;

  /** Theme severity */
  severity: ThemeSeverity;

  /** Transition type (emerged, escalated) */
  transition: ThemeStatus;

  /** Material at stake (if applicable) */
  materialAtStake?: number;

  /** Short explanation */
  explanation: string;
}

/**
 * Summarized candidate move for compact representation
 */
export interface CandidateSummary {
  /** Move in SAN notation */
  san: string;

  /** Evaluation in centipawns */
  evalCp: number;

  /** Mate in N (if applicable) */
  mate?: number;

  /** Primary classification source */
  source: CandidateSource;

  /** Brief reason for classification */
  reason: string;

  /** Maia probability (0-1) if available */
  humanProb?: number;

  /** First 3 moves of PV */
  pvPreview?: string[];
}

/**
 * Delta from parent position
 */
export interface ParentDelta {
  /** Move that led to this position (SAN) */
  move: string;

  /** Evaluation change in centipawns */
  evalChange: number;

  /** Win probability change (percentage points) */
  winProbChange: number;
}

/**
 * Compact snapshot of line memory context
 */
export interface LineContextSnapshot {
  /** Current ply in the analysis */
  ply: number;

  /** Recent summary bullets (last 3-5) */
  recentSummary: string[];

  /** Current narrative focus (if any) */
  focus?: string;

  /** Eval trend direction */
  evalTrend: 'improving' | 'declining' | 'stable';

  /** Count of unexplained themes */
  unexplainedThemeCount: number;
}

/**
 * Output constraints for LLM generation
 */
export interface OutputConstraints {
  /** Maximum words for comment */
  maxWords: number;

  /** Comment style */
  style: 'concise' | 'explanatory' | 'didactic';

  /** Target audience level */
  audience: 'beginner' | 'club' | 'expert';

  /** Whether to include variations */
  includeVariations: boolean;

  /** Whether to show evaluation numbers */
  showEvaluations: boolean;
}

/**
 * Default output constraints
 */
export const DEFAULT_OUTPUT_CONSTRAINTS: OutputConstraints = {
  maxWords: 50,
  style: 'concise',
  audience: 'club',
  includeVariations: true,
  showEvaluations: false,
};

/**
 * Agent Card
 *
 * Compact representation of position state for LLM input.
 * Replaces verbose position cards with structured, token-efficient format.
 */
export interface AgentCard {
  // Position identification
  /** Unique position key (zobrist:fen) */
  positionKey: string;

  /** FEN string */
  fen: string;

  /** Ply number in the game */
  ply: number;

  /** Side to move */
  sideToMove: 'w' | 'b';

  // Evaluation
  /** Current evaluation */
  eval: CompactEval;

  /** Win/Draw/Loss probabilities */
  wdl?: WDL;

  /** NAG annotation if applicable */
  nag?: string;

  /** Criticality score (0-100) */
  criticalityScore: number;

  // Change from parent
  /** Delta from parent position */
  parentDelta?: ParentDelta;

  // Themes (max 5, emerged/escalated only)
  /** Theme changes in this position */
  themeDeltas: ThemeDeltaSummary[];

  // Candidates (max 6)
  /** Top candidate moves */
  candidates: CandidateSummary[];

  // Line context
  /** Snapshot of line memory */
  lineContext: LineContextSnapshot;

  // Output constraints
  /** Constraints for LLM output */
  constraints: OutputConstraints;
}

/**
 * Input for narrator role (single intent)
 *
 * Used for generating a single comment from an intent with full context.
 */
export interface NarratorRoleInput {
  /** The comment intent to narrate */
  intent: CommentIntent;

  /** Agent card with position context */
  card: AgentCard;

  /** Previous comments for context (last 3-5) */
  previousComments: string[];

  /** Comment style */
  style: 'concise' | 'explanatory' | 'didactic';
}

/**
 * Input for tiebreaker role
 *
 * Used when exploration candidates are too close to choose algorithmically.
 */
export interface TiebreakerInput {
  /** Agent card with position context */
  card: AgentCard;

  /** Top candidates to choose between (2-3) */
  topCandidates: CandidateSummary[];

  /** Specific question for the tiebreaker */
  question: string;
}

/**
 * Input for didactic reframing
 *
 * Used to adjust comment style for specific audience levels.
 */
export interface DidacticInput {
  /** Original comment text */
  originalComment: string;

  /** Agent card with position context */
  card: AgentCard;

  /** Target audience level */
  targetAudience: 'beginner' | 'club' | 'expert';

  /** Terms that may need simplification */
  complexTerms?: string[];
}

/**
 * Result from narrator role
 */
export interface NarratorRoleResult {
  /** Generated comment text */
  comment: string;

  /** Tokens used in generation */
  tokensUsed: number;

  /** Confidence in the comment (0-1) */
  confidence: number;
}

/**
 * Result from tiebreaker role
 */
export interface TiebreakerResult {
  /** Selected move (SAN) */
  selectedMove: string;

  /** Reasoning for selection */
  reasoning: string;

  /** Confidence in the decision (0-1) */
  confidence: number;

  /** Tokens used in generation */
  tokensUsed: number;
}

/**
 * Result from didactic role
 */
export interface DidacticResult {
  /** Reframed comment text */
  reframedComment: string;

  /** Explanations added for complex terms */
  addedExplanations: string[];

  /** Terms that were simplified */
  simplifiedTerms: Map<string, string>;

  /** Tokens used in generation */
  tokensUsed: number;
}
