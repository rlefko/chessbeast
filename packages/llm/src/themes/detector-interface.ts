/**
 * Theme Detector Interface
 *
 * Defines the interface for theme detectors and the registry
 * for managing and running multiple detectors.
 */

import type { AnalysisTier, ThemeType, ThemeCategory, HCEFactors } from '@chessbeast/core/storage';

import type { ThemeInstance, ThemeDelta } from './types.js';

/**
 * Chess position data for theme detection
 *
 * Provides all the information a detector needs to analyze a position.
 */
export interface DetectorPosition {
  /** FEN string of the position */
  fen: string;

  /** Piece placement board (8x8 array) */
  board: (string | null)[][];

  /** Side to move */
  sideToMove: 'w' | 'b';

  /** Castling rights */
  castling: {
    whiteKingside: boolean;
    whiteQueenside: boolean;
    blackKingside: boolean;
    blackQueenside: boolean;
  };

  /** En passant target square (null if none) */
  enPassant: string | null;

  /** Half-move clock */
  halfmoveClock: number;

  /** Full move number */
  fullmoveNumber: number;

  /** King positions */
  whiteKingSquare: string;
  blackKingSquare: string;

  /** Material count */
  whiteMaterial: number;
  blackMaterial: number;

  /** Piece lists by type and color */
  pieces: {
    white: Map<string, string[]>; // piece type -> squares
    black: Map<string, string[]>;
  };
}

/**
 * Context provided to theme detectors
 */
export interface DetectorContext {
  /** Current position data */
  position: DetectorPosition;

  /** Current ply number */
  ply: number;

  /** Analysis tier (affects detection depth) */
  tier: AnalysisTier;

  /** HCE factors from Stockfish (if available) */
  hceFactors?: HCEFactors;

  /** Themes from the previous position (for lifecycle tracking) */
  previousThemes?: ThemeInstance[];

  /** Move that led to this position (if available) */
  lastMove?: {
    san: string;
    uci: string;
    from: string;
    to: string;
    piece: string;
    captured?: string;
    promotion?: string;
  };

  /** Engine evaluation (if available) */
  engineEval?: {
    cp: number;
    mate?: number;
    bestMove?: string;
  };
}

/**
 * Result from a single detector
 */
export interface DetectorResult {
  /** Detected themes */
  themes: ThemeInstance[];

  /** Theme transitions (emerged, resolved, etc.) */
  deltas: ThemeDelta[];

  /** Detection time in milliseconds */
  detectionTimeMs: number;

  /** Any warnings or notes */
  notes?: string[];
}

/**
 * Theme detector interface
 *
 * All theme detectors must implement this interface.
 */
export interface ThemeDetector {
  /** Unique identifier for this detector */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Theme types this detector can identify */
  readonly themeTypes: ThemeType[];

  /** Category of themes detected */
  readonly category: ThemeCategory;

  /** Minimum analysis tier required */
  readonly minimumTier: AnalysisTier;

  /** Priority for ordering (higher = run first) */
  readonly priority: number;

  /**
   * Detect themes in the given context
   */
  detect(context: DetectorContext): DetectorResult;

  /**
   * Check if this detector should run for the given tier
   */
  shouldRun(tier: AnalysisTier): boolean;
}

/**
 * Base class for theme detectors with common functionality
 */
export abstract class BaseThemeDetector implements ThemeDetector {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly themeTypes: ThemeType[];
  abstract readonly category: ThemeCategory;
  abstract readonly minimumTier: AnalysisTier;
  readonly priority: number = 50;

  /**
   * Check if this detector should run for the given tier
   */
  shouldRun(tier: AnalysisTier): boolean {
    const tierOrder: Record<AnalysisTier, number> = {
      shallow: 0,
      standard: 1,
      full: 2,
    };
    return (tierOrder[tier] ?? 0) >= (tierOrder[this.minimumTier] ?? 0);
  }

  /**
   * Detect themes - must be implemented by subclasses
   */
  abstract detect(context: DetectorContext): DetectorResult;

  /**
   * Helper to create an empty result
   */
  protected emptyResult(startTime: number): DetectorResult {
    return {
      themes: [],
      deltas: [],
      detectionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Helper to find a piece at a square
   */
  protected getPieceAt(position: DetectorPosition, square: string): string | null {
    const [file, rank] = this.squareToCoords(square);
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    return position.board[7 - rank]?.[file] ?? null;
  }

  /**
   * Convert square notation to coordinates
   */
  protected squareToCoords(square: string): [number, number] {
    const file = square.charCodeAt(0) - 97; // 'a' = 0
    const rank = parseInt(square[1]!) - 1; // '1' = 0
    return [file, rank];
  }

  /**
   * Convert coordinates to square notation
   */
  protected coordsToSquare(file: number, rank: number): string {
    return String.fromCharCode(97 + file) + (rank + 1);
  }

  /**
   * Check if a square is valid
   */
  protected isValidSquare(file: number, rank: number): boolean {
    return file >= 0 && file <= 7 && rank >= 0 && rank <= 7;
  }

  /**
   * Get piece color
   */
  protected getPieceColor(piece: string): 'w' | 'b' | null {
    if (!piece) return null;
    return piece === piece.toUpperCase() ? 'w' : 'b';
  }

  /**
   * Get piece type (lowercase)
   */
  protected getPieceType(piece: string): string {
    return piece.toLowerCase();
  }

  /**
   * Calculate material value of a piece
   */
  protected getPieceValue(piece: string): number {
    const values: Record<string, number> = {
      p: 100,
      n: 320,
      b: 330,
      r: 500,
      q: 900,
      k: 0,
    };
    return values[piece.toLowerCase()] ?? 0;
  }

  /**
   * Check if a piece is a sliding piece (bishop, rook, queen)
   */
  protected isSlidingPiece(piece: string): boolean {
    const type = piece.toLowerCase();
    return type === 'b' || type === 'r' || type === 'q';
  }

  /**
   * Get attack directions for a piece type
   */
  protected getAttackDirections(pieceType: string): [number, number][] {
    switch (pieceType.toLowerCase()) {
      case 'n':
        return [
          [1, 2],
          [2, 1],
          [2, -1],
          [1, -2],
          [-1, -2],
          [-2, -1],
          [-2, 1],
          [-1, 2],
        ];
      case 'b':
        return [
          [1, 1],
          [1, -1],
          [-1, -1],
          [-1, 1],
        ];
      case 'r':
        return [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ];
      case 'q':
      case 'k':
        return [
          [0, 1],
          [1, 1],
          [1, 0],
          [1, -1],
          [0, -1],
          [-1, -1],
          [-1, 0],
          [-1, 1],
        ];
      default:
        return [];
    }
  }

  /**
   * Check if two squares are on the same diagonal
   */
  protected onSameDiagonal(sq1: string, sq2: string): boolean {
    const [f1, r1] = this.squareToCoords(sq1);
    const [f2, r2] = this.squareToCoords(sq2);
    return Math.abs(f1 - f2) === Math.abs(r1 - r2);
  }

  /**
   * Check if two squares are on the same file or rank
   */
  protected onSameFileOrRank(sq1: string, sq2: string): boolean {
    const [f1, r1] = this.squareToCoords(sq1);
    const [f2, r2] = this.squareToCoords(sq2);
    return f1 === f2 || r1 === r2;
  }

  /**
   * Get all squares between two squares (exclusive)
   */
  protected getSquaresBetween(sq1: string, sq2: string): string[] {
    const [f1, r1] = this.squareToCoords(sq1);
    const [f2, r2] = this.squareToCoords(sq2);

    const df = Math.sign(f2 - f1);
    const dr = Math.sign(r2 - r1);

    const squares: string[] = [];
    let f = f1 + df;
    let r = r1 + dr;

    while (f !== f2 || r !== r2) {
      squares.push(this.coordsToSquare(f, r));
      f += df;
      r += dr;
    }

    return squares;
  }

  /**
   * Check if path between two squares is clear
   */
  protected isPathClear(position: DetectorPosition, sq1: string, sq2: string): boolean {
    const between = this.getSquaresBetween(sq1, sq2);
    return between.every((sq) => this.getPieceAt(position, sq) === null);
  }
}

/**
 * Theme detector registry
 *
 * Manages registration and execution of multiple theme detectors.
 */
export class DetectorRegistry {
  private detectors: ThemeDetector[] = [];

  /**
   * Register a detector
   */
  register(detector: ThemeDetector): void {
    this.detectors.push(detector);
    // Sort by priority (descending)
    this.detectors.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Register multiple detectors
   */
  registerAll(detectors: ThemeDetector[]): void {
    for (const detector of detectors) {
      this.register(detector);
    }
  }

  /**
   * Get all registered detectors
   */
  getDetectors(): ThemeDetector[] {
    return [...this.detectors];
  }

  /**
   * Get detectors for a specific category
   */
  getDetectorsByCategory(category: ThemeCategory): ThemeDetector[] {
    return this.detectors.filter((d) => d.category === category);
  }

  /**
   * Get detectors that should run for a tier
   */
  getDetectorsForTier(tier: AnalysisTier): ThemeDetector[] {
    return this.detectors.filter((d) => d.shouldRun(tier));
  }

  /**
   * Run all applicable detectors for a context
   */
  detectAll(context: DetectorContext): DetectorResult {
    const startTime = Date.now();
    const allThemes: ThemeInstance[] = [];
    const allDeltas: ThemeDelta[] = [];
    const allNotes: string[] = [];

    const applicableDetectors = this.getDetectorsForTier(context.tier);

    for (const detector of applicableDetectors) {
      try {
        const result = detector.detect(context);
        allThemes.push(...result.themes);
        allDeltas.push(...result.deltas);
        if (result.notes) {
          allNotes.push(...result.notes);
        }
      } catch (error) {
        allNotes.push(`Detector ${detector.id} failed: ${error}`);
      }
    }

    const result: DetectorResult = {
      themes: allThemes,
      deltas: allDeltas,
      detectionTimeMs: Date.now() - startTime,
    };

    if (allNotes.length > 0) {
      result.notes = allNotes;
    }

    return result;
  }
}

/**
 * Create a new detector registry
 */
export function createDetectorRegistry(): DetectorRegistry {
  return new DetectorRegistry();
}
