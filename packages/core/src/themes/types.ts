/**
 * Theme Detection Types
 *
 * Type definitions for tactical and positional theme detection.
 * These themes help the LLM understand position characteristics
 * and generate more insightful annotations.
 */

/**
 * Tactical theme identifiers
 *
 * Tactical themes involve forcing sequences, material gain,
 * or direct threats to pieces.
 */
export type TacticalThemeId =
  // Pins (4)
  | 'absolute_pin' // Pinned to king - piece cannot legally move
  | 'relative_pin' // Pinned to more valuable piece
  | 'cross_pin' // Piece pinned in two directions
  | 'situational_pin' // Moving would lose material
  // Forks (5)
  | 'knight_fork' // Knight attacks 2+ pieces
  | 'pawn_fork' // Pawn attacks 2+ pieces
  | 'fork' // Generic fork (2+ pieces attacked)
  | 'double_attack' // Any piece attacks 2+ targets
  | 'double_check' // Two pieces give check simultaneously
  // Linear tactics (3)
  | 'skewer' // Attack through piece to more valuable behind
  | 'x_ray_attack' // Attack through blocker
  | 'x_ray_defense' // Defense through blocker
  // Discovery tactics (2)
  | 'discovered_attack' // Moving piece reveals attack
  | 'discovered_check' // Moving piece reveals check
  // Batteries (5)
  | 'battery' // Two pieces aligned on file/diagonal
  | 'queen_bishop_battery' // Queen + bishop aligned
  | 'rooks_doubled' // Two rooks on same file
  | 'alekhines_gun' // Queen behind two rooks
  | 'rooks_seventh' // Two rooks on 7th rank
  // Forcing moves (5)
  | 'attraction' // Force piece to bad square
  | 'deflection' // Force defender away
  | 'decoy' // Lure piece to bad square
  | 'interference' // Block defender's line
  | 'clearance' // Clear square/line for another piece
  // Defender tactics (3)
  | 'remove_defender' // Capture the defender
  | 'overloaded_piece' // Piece has too many duties
  | 'desperado' // Piece about to be lost makes captures
  // Weaknesses (4)
  | 'back_rank_weakness' // King trapped on back rank
  | 'f2_f7_weakness' // Weak squares near king
  | 'trapped_piece' // Piece with no escape
  | 'domination' // Complete control of piece's squares
  // Special tactics (4)
  | 'zwischenzug' // Intermediate move before recapture
  | 'windmill' // Repeating discovered check pattern
  | 'greek_gift' // Bxh7+ sacrifice pattern
  | 'sacrifice' // Generic material sacrifice
  // Pawn tactics (3)
  | 'advanced_pawn' // Pawn on 6th/7th rank
  | 'pawn_breakthrough' // Pawn sacrifice to create passer
  | 'underpromotion' // Promotion to non-queen
  // Endgame specific (3)
  | 'opposition' // Kings in opposition
  | 'triangulation' // Losing a tempo with king
  | 'zugzwang'; // Must move but all moves lose

/**
 * Positional theme identifiers
 *
 * Positional themes involve static features of the position
 * like pawn structure, piece placement, and space control.
 */
export type PositionalThemeId =
  // Pawn structure (6)
  | 'weak_pawn' // Pawn that cannot be defended by pawns
  | 'isolated_pawn' // Pawn with no friendly pawns on adjacent files
  | 'doubled_pawns' // Two pawns on same file
  | 'backward_pawn' // Pawn that cannot advance safely
  | 'passed_pawn' // Pawn with no enemy pawns blocking/attacking
  | 'pawn_break_available' // Natural pawn lever available
  // Squares (5)
  | 'weak_square' // Square undefendable by pawns
  | 'outpost' // Controlled square enemy can't contest
  | 'power_outpost' // Outpost with piece on it
  | 'pseudo_outpost' // Almost outpost, contestable with tempo
  | 'entry_square' // Invasion point for pieces
  // Color complex (1)
  | 'color_weakness' // Light/dark square weakness
  // Control (3)
  | 'central_control' // Center dominance
  | 'space_advantage' // Space superiority
  | 'convergence_zone' // Piece coordination point
  // Files (2)
  | 'open_file' // Fully open file
  | 'semi_open_file' // Half-open file
  // Piece activity (4)
  | 'activity_advantage' // More active pieces
  | 'development_lead' // More developed
  | 'piece_passivity' // Restricted pieces
  | 'paralysis' // Frozen/blocked position
  // Majority (1)
  | 'pawn_majority' // Queenside/kingside majority
  // Structures (2)
  | 'fortress' // Defensive structure
  | 'steamrolling'; // Overwhelming pawn advance

/**
 * Combined theme type
 */
export type ThemeId = TacticalThemeId | PositionalThemeId;

/**
 * Theme category
 */
export type ThemeCategory = 'tactical' | 'positional';

/**
 * Confidence level for theme detection
 */
export type ThemeConfidence = 'high' | 'medium' | 'low';

/**
 * Severity/importance of theme in the position
 */
export type ThemeSeverity = 'critical' | 'significant' | 'minor';

/**
 * Color type for chess
 */
export type Color = 'w' | 'b';

/**
 * A detected theme with metadata
 */
export interface DetectedTheme {
  /** Theme identifier */
  id: ThemeId;

  /** Category: tactical or positional */
  category: ThemeCategory;

  /** Confidence score based on detection method quality */
  confidence: ThemeConfidence;

  /** How important this theme is to the position */
  severity: ThemeSeverity;

  /** Squares involved in the tactic (e.g., ["e5", "d6"]) */
  squares?: string[];

  /** Pieces involved (piece notation, e.g., ["Nf3", "Qd8"]) */
  pieces?: string[];

  /** Side that benefits from this theme */
  beneficiary: Color;

  /** Human-readable explanation for LLM context */
  explanation: string;

  /** Estimated material value at stake (centipawns) */
  materialAtStake?: number;
}

/**
 * Detection tier controls analysis depth
 */
export type DetectionTier = 'full' | 'standard' | 'shallow';

/**
 * Configuration for theme detection
 */
export interface DetectionConfig {
  /** Detection tier (controls which detectors run) */
  tier?: DetectionTier;

  /** Only detect themes where this side benefits */
  forSide?: Color;

  /** Minimum confidence threshold (default: all) */
  minConfidence?: ThemeConfidence;

  /** Maximum themes to return (default: 10) */
  maxThemes?: number;

  /** Last move played (for context-aware detection) */
  lastMove?: string;
}

/**
 * Complete theme detection result
 */
export interface ThemeDetectionResult {
  /** Detected tactical themes */
  tactical: DetectedTheme[];

  /** Detected positional themes */
  positional: DetectedTheme[];

  /** Overall summary for LLM */
  summary: string;

  /** Detection tier used */
  tier: DetectionTier;
}

/**
 * Piece information with location
 */
export interface LocatedPiece {
  /** Piece type (p, n, b, r, q, k) */
  type: string;

  /** Piece color */
  color: Color;

  /** Square location (e.g., "e4") */
  square: string;
}

/**
 * Ray direction for sliding pieces
 */
export type Direction = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * All eight directions
 */
export const ALL_DIRECTIONS: Direction[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/**
 * Cardinal directions (for rooks)
 */
export const CARDINAL_DIRECTIONS: Direction[] = ['n', 's', 'e', 'w'];

/**
 * Diagonal directions (for bishops)
 */
export const DIAGONAL_DIRECTIONS: Direction[] = ['ne', 'nw', 'se', 'sw'];

/**
 * All 64 squares on the board
 */
export const ALL_SQUARES: string[] = [];
for (const file of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
  for (const rank of ['1', '2', '3', '4', '5', '6', '7', '8']) {
    ALL_SQUARES.push(`${file}${rank}`);
  }
}

/**
 * Center squares (d4, d5, e4, e5)
 */
export const CENTER_SQUARES = ['d4', 'd5', 'e4', 'e5'];

/**
 * Extended center (c3-f3 to c6-f6)
 */
export const EXTENDED_CENTER = [
  'c3',
  'd3',
  'e3',
  'f3',
  'c4',
  'd4',
  'e4',
  'f4',
  'c5',
  'd5',
  'e5',
  'f5',
  'c6',
  'd6',
  'e6',
  'f6',
];
