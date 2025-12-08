/**
 * Skewer Detector
 *
 * Detects skewers (x-ray attacks) in chess positions.
 * A skewer attacks a valuable piece that, when it moves, exposes a piece behind it.
 */

import type { ThemeType, ThemeSeverity, ThemePieceInfo } from '@chessbeast/core/storage';

import {
  BaseThemeDetector,
  type DetectorContext,
  type DetectorResult,
  type DetectorPosition,
} from '../detector-interface.js';
import { createThemeInstance, createThemeDelta } from '../types.js';

/**
 * Skewer information
 */
interface SkewerInfo {
  /** Attacking piece square */
  attackerSquare: string;
  /** Attacking piece type */
  attackerPiece: string;
  /** Front (attacked) piece square */
  frontSquare: string;
  /** Front piece type */
  frontPiece: string;
  /** Back (exposed) piece square */
  backSquare: string;
  /** Back piece type */
  backPiece: string;
  /** Attacker side */
  attackerSide: 'w' | 'b';
  /** Material value of front piece */
  frontValue: number;
  /** Material value of back piece */
  backValue: number;
  /** Is the front piece the king (absolute skewer)? */
  isAbsolute: boolean;
}

/**
 * Detects skewers in chess positions
 */
export class SkewerDetector extends BaseThemeDetector {
  readonly id = 'skewer-detector';
  readonly name = 'Skewer Detector';
  readonly themeTypes: ThemeType[] = ['skewer'];
  readonly category = 'tactical';
  readonly minimumTier = 'shallow';
  readonly priority = 85;

  detect(context: DetectorContext): DetectorResult {
    const startTime = Date.now();
    const { position, ply, previousThemes } = context;

    const skewers = this.findAllSkewers(position);
    const themes = skewers.map((skewer) => this.skewerToTheme(skewer, ply));

    const deltas = previousThemes
      ? this.computeDeltas(themes, previousThemes)
      : themes.map((t) =>
          createThemeDelta(t, 'emerged', {
            changeDescription: `${t.type} detected`,
          }),
        );

    return {
      themes,
      deltas,
      detectionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Find all skewers in the position
   */
  private findAllSkewers(position: DetectorPosition): SkewerInfo[] {
    const skewers: SkewerInfo[] = [];

    for (const attackerSide of ['w', 'b'] as const) {
      const defenderSide = attackerSide === 'w' ? 'b' : 'w';

      // Get sliding pieces that can skewer
      const sliders = this.getSlidingPieces(position, attackerSide);

      for (const slider of sliders) {
        // Check all directions for potential skewers
        const directions = this.getDirectionsForPiece(slider.piece);

        for (const dir of directions) {
          const skewer = this.checkSkewerInDirection(
            position,
            slider.square,
            slider.piece,
            dir,
            attackerSide,
            defenderSide,
          );
          if (skewer) {
            skewers.push(skewer);
          }
        }
      }
    }

    return skewers;
  }

  /**
   * Check for a skewer in a specific direction
   */
  private checkSkewerInDirection(
    position: DetectorPosition,
    attackerSquare: string,
    attackerPiece: string,
    direction: [number, number],
    attackerSide: 'w' | 'b',
    defenderSide: 'w' | 'b',
  ): SkewerInfo | null {
    const [dr, dc] = direction;
    let currentSquare = attackerSquare;
    let frontPiece: { square: string; piece: string } | null = null;
    let backPiece: { square: string; piece: string } | null = null;

    // Traverse in the direction (max 7 squares in any direction)
    for (let step = 0; step < 7; step++) {
      const nextSquare = this.offsetSquare(currentSquare, dr, dc);
      if (!nextSquare) break;
      currentSquare = nextSquare;

      const piece = this.getPieceAt(position, currentSquare);
      if (!piece) continue;

      const pieceColor = this.getPieceColor(piece);

      if (!frontPiece) {
        // First piece found - must be defender's piece for a skewer
        if (pieceColor !== defenderSide) break;
        frontPiece = { square: currentSquare, piece };
      } else {
        // Second piece found
        if (pieceColor !== defenderSide) break; // Must be defender's piece
        backPiece = { square: currentSquare, piece };
        break;
      }
    }

    if (!frontPiece || !backPiece) return null;

    const frontValue = this.getPieceValue(frontPiece.piece);
    const backValue = this.getPieceValue(backPiece.piece);

    // For a skewer, the front piece should be more valuable than the back
    // (or the front is the king making it absolute)
    const isAbsolute = frontPiece.piece.toLowerCase() === 'k';
    if (!isAbsolute && frontValue <= backValue) {
      return null; // Not a skewer - would be a pin instead
    }

    return {
      attackerSquare,
      attackerPiece,
      frontSquare: frontPiece.square,
      frontPiece: frontPiece.piece,
      backSquare: backPiece.square,
      backPiece: backPiece.piece,
      attackerSide,
      frontValue,
      backValue,
      isAbsolute,
    };
  }

  /**
   * Get sliding pieces for a side
   */
  private getSlidingPieces(
    position: DetectorPosition,
    side: 'w' | 'b',
  ): { square: string; piece: string }[] {
    const pieces: { square: string; piece: string }[] = [];
    const pieceMap = side === 'w' ? position.pieces.white : position.pieces.black;

    for (const [pieceType, squares] of pieceMap) {
      if (pieceType === 'b' || pieceType === 'r' || pieceType === 'q') {
        for (const square of squares) {
          const piece = side === 'w' ? pieceType.toUpperCase() : pieceType;
          pieces.push({ square, piece });
        }
      }
    }

    return pieces;
  }

  /**
   * Get movement directions for a piece type
   */
  private getDirectionsForPiece(piece: string): [number, number][] {
    const type = piece.toLowerCase();
    const diagonals: [number, number][] = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    const orthogonals: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    if (type === 'b') return diagonals;
    if (type === 'r') return orthogonals;
    if (type === 'q') return [...diagonals, ...orthogonals];
    return [];
  }

  /**
   * Offset a square by rank and file delta
   */
  private offsetSquare(square: string, rankDelta: number, fileDelta: number): string | null {
    const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = parseInt(square[1]!) - 1;

    const newFile = file + fileDelta;
    const newRank = rank + rankDelta;

    if (newFile < 0 || newFile > 7 || newRank < 0 || newRank > 7) {
      return null;
    }

    return String.fromCharCode('a'.charCodeAt(0) + newFile) + (newRank + 1);
  }

  /**
   * Convert skewer to theme instance
   */
  private skewerToTheme(skewer: SkewerInfo, ply: number): ReturnType<typeof createThemeInstance> {
    const severity = this.calculateSkewerSeverity(skewer);
    const confidence = skewer.isAbsolute ? 0.95 : 0.85;
    const defenderSide = skewer.attackerSide === 'w' ? 'b' : 'w';

    const pieces: ThemePieceInfo[] = [
      {
        type: skewer.attackerPiece.toLowerCase(),
        square: skewer.attackerSquare,
        color: skewer.attackerSide,
        role: 'attacker',
      },
      {
        type: skewer.frontPiece.toLowerCase(),
        square: skewer.frontSquare,
        color: defenderSide,
        role: 'front piece',
      },
      {
        type: skewer.backPiece.toLowerCase(),
        square: skewer.backSquare,
        color: defenderSide,
        role: 'back piece',
      },
    ];

    const explanation = skewer.isAbsolute
      ? `${this.pieceNameCap(skewer.attackerPiece)} skewers king, winning ${this.pieceName(skewer.backPiece)}`
      : `${this.pieceNameCap(skewer.attackerPiece)} skewers ${this.pieceName(skewer.frontPiece)} and ${this.pieceName(skewer.backPiece)}`;

    const detailedExplanation =
      `The ${this.pieceName(skewer.attackerPiece)} on ${skewer.attackerSquare} ` +
      `attacks the ${this.pieceName(skewer.frontPiece)} on ${skewer.frontSquare}. ` +
      `When the ${this.pieceName(skewer.frontPiece)} moves, the ${this.pieceName(skewer.backPiece)} ` +
      `on ${skewer.backSquare} will be captured.`;

    return createThemeInstance(
      'skewer',
      'tactical',
      skewer.attackerSide,
      skewer.attackerSquare,
      severity,
      confidence,
      explanation,
      ply,
      {
        secondarySquares: [skewer.frontSquare, skewer.backSquare],
        pieces,
        materialAtStake: skewer.backValue,
        detailedExplanation,
      },
    );
  }

  /**
   * Calculate skewer severity
   */
  private calculateSkewerSeverity(skewer: SkewerInfo): ThemeSeverity {
    if (skewer.isAbsolute) {
      if (skewer.backValue >= 500) return 'critical';
      return 'significant';
    }

    if (skewer.backValue >= 500) return 'critical';
    if (skewer.backValue >= 300) return 'significant';
    if (skewer.backValue >= 100) return 'moderate';
    return 'minor';
  }

  /**
   * Get piece name
   */
  private pieceName(piece: string): string {
    const names: Record<string, string> = {
      p: 'pawn',
      n: 'knight',
      b: 'bishop',
      r: 'rook',
      q: 'queen',
      k: 'king',
    };
    return names[piece.toLowerCase()] ?? 'piece';
  }

  /**
   * Get capitalized piece name
   */
  private pieceNameCap(piece: string): string {
    const name = this.pieceName(piece);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /**
   * Compute deltas from previous themes
   */
  private computeDeltas(
    newThemes: ReturnType<typeof createThemeInstance>[],
    previousThemes: ReturnType<typeof createThemeInstance>[],
  ): ReturnType<typeof createThemeDelta>[] {
    const deltas: ReturnType<typeof createThemeDelta>[] = [];
    const previousByKey = new Map(previousThemes.map((t) => [t.themeKey, t]));
    const newKeys = new Set(newThemes.map((t) => t.themeKey));

    for (const theme of newThemes) {
      const prev = previousByKey.get(theme.themeKey);
      if (prev) {
        deltas.push(createThemeDelta(theme, 'persisting', { previousStatus: prev.status }));
      } else {
        deltas.push(
          createThemeDelta(theme, 'emerged', {
            changeDescription: `skewer detected on ${theme.primarySquare}`,
          }),
        );
      }
    }

    for (const [key, prev] of previousByKey) {
      if (!newKeys.has(key)) {
        deltas.push(
          createThemeDelta({ ...prev, status: 'resolved' }, 'resolved', {
            previousStatus: prev.status,
            changeDescription: 'skewer resolved',
          }),
        );
      }
    }

    return deltas;
  }
}

/**
 * Create a skewer detector instance
 */
export function createSkewerDetector(): SkewerDetector {
  return new SkewerDetector();
}
