/**
 * Theme Artifact
 *
 * Immutable artifact storing detected tactical and positional themes.
 * Themes are first-class signals that drive exploration and annotation.
 */

import type { BaseArtifact, AnalysisTier } from './base.js';

/**
 * Theme categories for grouping and filtering
 */
export type ThemeCategory = 'tactical' | 'structural' | 'positional' | 'dynamic';

/**
 * All detectable theme types organized by category
 *
 * TACTICAL (12 types):
 * - Pins, forks, skewers, discovered attacks
 * - Double attacks, overloaded pieces
 * - Deflection, decoy, removal of guard
 * - Back rank threats, zwischenzug
 *
 * STRUCTURAL (7 types):
 * - Pawn structure weaknesses and strengths
 *
 * POSITIONAL (8 types):
 * - Piece placement and activity themes
 *
 * DYNAMIC (6 types):
 * - King safety, initiative, development
 */
export type ThemeType =
  // Tactical themes
  | 'absolute_pin' // Pinned to king (illegal to move)
  | 'relative_pin' // Pinned to valuable piece (legal but losing)
  | 'fork' // Knight/pawn/queen attacking 2+ pieces
  | 'skewer' // Attack through piece to more valuable behind
  | 'discovered_attack' // Moving piece reveals attack by another
  | 'discovered_check' // Discovered attack that is also check
  | 'double_attack' // Single move creates two threats
  | 'overloaded_piece' // Piece defending multiple targets
  | 'deflection' // Lure defender away from duty
  | 'decoy' // Lure piece to bad square
  | 'removal_of_guard' // Capture/threaten the defender
  | 'back_rank_threat' // Back rank mate possibility
  | 'zwischenzug' // Intermediate move before expected recapture

  // Structural themes
  | 'isolated_pawn' // Pawn with no adjacent pawns
  | 'doubled_pawns' // Two pawns on same file
  | 'backward_pawn' // Pawn that can't safely advance
  | 'passed_pawn' // Pawn with no enemy pawns blocking
  | 'connected_passers' // Multiple passed pawns supporting each other
  | 'pawn_majority' // More pawns on one side
  | 'pawn_chain' // Diagonal pawn structure

  // Positional themes
  | 'outpost' // Piece on stable square (can't be challenged by pawns)
  | 'weak_square' // Square no longer defended by pawns
  | 'weak_complex' // Multiple weak squares of same color
  | 'bishop_pair' // Both bishops vs opponent missing one
  | 'bad_bishop' // Bishop blocked by own pawns
  | 'knight_on_rim' // Knight on edge (limited mobility)
  | 'piece_activity' // Centralized, active pieces
  | 'space_advantage' // Control of more squares

  // Dynamic themes
  | 'king_in_center' // King not castled, center files open
  | 'king_safety' // General king safety assessment
  | 'open_file' // File with no pawns (rook potential)
  | 'half_open_file' // File with only one side's pawn
  | 'development_lead' // More pieces developed
  | 'initiative'; // Ability to create threats

/**
 * Severity levels for themes
 */
export type ThemeSeverity = 'critical' | 'significant' | 'moderate' | 'minor';

/**
 * Confidence levels for theme detection
 */
export type ThemeConfidence = 'certain' | 'high' | 'medium' | 'low';

/**
 * Piece information for theme context
 */
export interface ThemePieceInfo {
  /** Square the piece is on (e.g., 'e4') */
  square: string;

  /** Piece type (p, n, b, r, q, k) */
  type: string;

  /** Piece color */
  color: 'w' | 'b';

  /** Role in the theme (e.g., 'pinner', 'pinned', 'target') */
  role?: string;
}

/**
 * A single detected theme in a position
 */
export interface DetectedTheme {
  /** Theme identifier */
  themeId: ThemeType;

  /** Human-readable theme name */
  name: string;

  /** Category for grouping */
  category: ThemeCategory;

  /** Which side benefits from this theme */
  beneficiary: 'w' | 'b';

  /** Severity/importance of the theme */
  severity: ThemeSeverity;

  /** Confidence score (0-1) */
  confidence: number;

  /** Confidence level derived from score */
  confidenceLevel: ThemeConfidence;

  /** Primary square(s) involved (e.g., pinned piece square) */
  squares?: string[];

  /** Pieces involved in the theme */
  pieces?: ThemePieceInfo[];

  /** Estimated material at stake (centipawns) */
  materialAtStake?: number;

  /** Brief explanation for LLM context */
  explanation: string;

  /** Detailed explanation for human display */
  detailedExplanation?: string;
}

/**
 * Immutable theme detection artifact
 */
export interface ThemeArtifact extends BaseArtifact {
  readonly kind: 'themes';

  /** Analysis tier that produced these themes */
  readonly tier: AnalysisTier;

  /** Detected themes */
  readonly detected: DetectedTheme[];

  /** Detector version for cache invalidation */
  readonly detectorVersion: string;

  /** Detection time in milliseconds */
  readonly detectionTimeMs: number;
}

/**
 * Get the category for a theme type
 */
export function getThemeCategory(themeType: ThemeType): ThemeCategory {
  const tacticalThemes: ThemeType[] = [
    'absolute_pin',
    'relative_pin',
    'fork',
    'skewer',
    'discovered_attack',
    'discovered_check',
    'double_attack',
    'overloaded_piece',
    'deflection',
    'decoy',
    'removal_of_guard',
    'back_rank_threat',
    'zwischenzug',
  ];

  const structuralThemes: ThemeType[] = [
    'isolated_pawn',
    'doubled_pawns',
    'backward_pawn',
    'passed_pawn',
    'connected_passers',
    'pawn_majority',
    'pawn_chain',
  ];

  const positionalThemes: ThemeType[] = [
    'outpost',
    'weak_square',
    'weak_complex',
    'bishop_pair',
    'bad_bishop',
    'knight_on_rim',
    'piece_activity',
    'space_advantage',
  ];

  if (tacticalThemes.includes(themeType)) return 'tactical';
  if (structuralThemes.includes(themeType)) return 'structural';
  if (positionalThemes.includes(themeType)) return 'positional';
  return 'dynamic';
}

/**
 * Get human-readable name for a theme type
 */
export function getThemeName(themeType: ThemeType): string {
  const names: Record<ThemeType, string> = {
    // Tactical
    absolute_pin: 'Absolute Pin',
    relative_pin: 'Relative Pin',
    fork: 'Fork',
    skewer: 'Skewer',
    discovered_attack: 'Discovered Attack',
    discovered_check: 'Discovered Check',
    double_attack: 'Double Attack',
    overloaded_piece: 'Overloaded Piece',
    deflection: 'Deflection',
    decoy: 'Decoy',
    removal_of_guard: 'Removal of Guard',
    back_rank_threat: 'Back Rank Threat',
    zwischenzug: 'Zwischenzug',
    // Structural
    isolated_pawn: 'Isolated Pawn',
    doubled_pawns: 'Doubled Pawns',
    backward_pawn: 'Backward Pawn',
    passed_pawn: 'Passed Pawn',
    connected_passers: 'Connected Passed Pawns',
    pawn_majority: 'Pawn Majority',
    pawn_chain: 'Pawn Chain',
    // Positional
    outpost: 'Outpost',
    weak_square: 'Weak Square',
    weak_complex: 'Weak Color Complex',
    bishop_pair: 'Bishop Pair',
    bad_bishop: 'Bad Bishop',
    knight_on_rim: 'Knight on Rim',
    piece_activity: 'Piece Activity',
    space_advantage: 'Space Advantage',
    // Dynamic
    king_in_center: 'King in Center',
    king_safety: 'King Safety',
    open_file: 'Open File',
    half_open_file: 'Half-Open File',
    development_lead: 'Development Lead',
    initiative: 'Initiative',
  };

  return names[themeType] ?? themeType;
}

/**
 * Convert confidence score to level
 */
export function confidenceToLevel(confidence: number): ThemeConfidence {
  if (confidence >= 0.95) return 'certain';
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

/**
 * Create a detected theme with proper defaults
 */
export function createDetectedTheme(
  themeId: ThemeType,
  beneficiary: 'w' | 'b',
  severity: ThemeSeverity,
  confidence: number,
  explanation: string,
  options?: {
    squares?: string[];
    pieces?: ThemePieceInfo[];
    materialAtStake?: number;
    detailedExplanation?: string;
  },
): DetectedTheme {
  const theme: DetectedTheme = {
    themeId,
    name: getThemeName(themeId),
    category: getThemeCategory(themeId),
    beneficiary,
    severity,
    confidence,
    confidenceLevel: confidenceToLevel(confidence),
    explanation,
  };

  if (options?.squares !== undefined) {
    (theme as { squares: string[] }).squares = options.squares;
  }
  if (options?.pieces !== undefined) {
    (theme as { pieces: ThemePieceInfo[] }).pieces = options.pieces;
  }
  if (options?.materialAtStake !== undefined) {
    (theme as { materialAtStake: number }).materialAtStake = options.materialAtStake;
  }
  if (options?.detailedExplanation !== undefined) {
    (theme as { detailedExplanation: string }).detailedExplanation = options.detailedExplanation;
  }

  return theme;
}

/**
 * Create a theme artifact from detection results
 */
export function createThemeArtifact(
  positionKey: string,
  tier: AnalysisTier,
  detected: DetectedTheme[],
  detectorVersion: string,
  detectionTimeMs: number,
): ThemeArtifact {
  return {
    kind: 'themes',
    positionKey,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
    tier,
    detected,
    detectorVersion,
    detectionTimeMs,
  };
}

/**
 * Filter themes by severity
 */
export function filterThemesBySeverity(
  themes: DetectedTheme[],
  minSeverity: ThemeSeverity,
): DetectedTheme[] {
  const severityOrder: Record<ThemeSeverity, number> = {
    minor: 0,
    moderate: 1,
    significant: 2,
    critical: 3,
  };

  const minLevel = severityOrder[minSeverity];
  return themes.filter((t) => severityOrder[t.severity] >= minLevel);
}

/**
 * Group themes by beneficiary and category
 */
export function groupThemes(themes: DetectedTheme[]): Map<string, DetectedTheme[]> {
  const groups = new Map<string, DetectedTheme[]>();

  for (const theme of themes) {
    const key = `${theme.beneficiary}:${theme.category}`;
    const existing = groups.get(key) ?? [];
    existing.push(theme);
    groups.set(key, existing);
  }

  return groups;
}

/**
 * Generate a stable theme key for lifecycle tracking
 *
 * Format: `${themeId}:${primarySquare}:${beneficiary}`
 */
export function generateThemeKey(theme: DetectedTheme): string {
  const primarySquare = theme.squares?.[0] ?? 'global';
  return `${theme.themeId}:${primarySquare}:${theme.beneficiary}`;
}
