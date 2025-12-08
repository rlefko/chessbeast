/**
 * Pin Detector
 *
 * Detects absolute and relative pins in chess positions.
 *
 * - Absolute pin: Pinned piece cannot legally move (would expose king)
 * - Relative pin: Moving the pinned piece loses material
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
 * Pin information
 */
interface PinInfo {
  /** Pinning piece square */
  pinnerSquare: string;
  /** Pinning piece type */
  pinnerPiece: string;
  /** Pinned piece square */
  pinnedSquare: string;
  /** Pinned piece type */
  pinnedPiece: string;
  /** Target piece square (king for absolute, valuable piece for relative) */
  targetSquare: string;
  /** Target piece type */
  targetPiece: string;
  /** Is this an absolute pin (target is king)? */
  isAbsolute: boolean;
  /** Attacker side */
  attackerSide: 'w' | 'b';
  /** Material value of pinned piece */
  pinnedValue: number;
  /** Material value of target piece (if relative pin) */
  targetValue: number;
}

/**
 * Detects pins in chess positions
 */
export class PinDetector extends BaseThemeDetector {
  readonly id = 'pin-detector';
  readonly name = 'Pin Detector';
  readonly themeTypes: ThemeType[] = ['absolute_pin', 'relative_pin'];
  readonly category = 'tactical';
  readonly minimumTier = 'shallow';
  readonly priority = 90; // High priority - pins are fundamental

  detect(context: DetectorContext): DetectorResult {
    const startTime = Date.now();
    const { position, ply, previousThemes } = context;

    const pins = this.findAllPins(position);
    const themes = pins.map((pin) => this.pinToTheme(pin, ply));

    // Compute deltas if we have previous themes
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
   * Find all pins in the position
   */
  private findAllPins(position: DetectorPosition): PinInfo[] {
    const pins: PinInfo[] = [];

    // Check pins from both sides
    for (const attackerSide of ['w', 'b'] as const) {
      const defenderSide = attackerSide === 'w' ? 'b' : 'w';

      // Get sliding pieces that can pin (bishops, rooks, queens)
      const pinners = this.getSlidingPieces(position, attackerSide);
      const kingSquare = attackerSide === 'w' ? position.blackKingSquare : position.whiteKingSquare;

      for (const pinner of pinners) {
        // Check for absolute pins (to king)
        const absolutePin = this.checkPin(
          position,
          pinner.square,
          pinner.piece,
          kingSquare,
          attackerSide,
          defenderSide,
          true,
        );
        if (absolutePin) {
          pins.push(absolutePin);
        }

        // Check for relative pins (to valuable pieces)
        const valuablePieces = this.getValuablePieces(position, defenderSide);
        for (const target of valuablePieces) {
          // Skip king (already checked as absolute pin)
          if (target.square === kingSquare) continue;

          const relativePin = this.checkPin(
            position,
            pinner.square,
            pinner.piece,
            target.square,
            attackerSide,
            defenderSide,
            false,
          );
          if (relativePin) {
            pins.push(relativePin);
          }
        }
      }
    }

    return pins;
  }

  /**
   * Check if there's a pin along a line
   */
  private checkPin(
    position: DetectorPosition,
    pinnerSquare: string,
    pinnerPiece: string,
    targetSquare: string,
    attackerSide: 'w' | 'b',
    defenderSide: 'w' | 'b',
    isAbsoluteCheck: boolean,
  ): PinInfo | null {
    const pinnerType = this.getPieceType(pinnerPiece);

    // Check if pinner can reach target square
    const canReach =
      (pinnerType === 'b' && this.onSameDiagonal(pinnerSquare, targetSquare)) ||
      (pinnerType === 'r' && this.onSameFileOrRank(pinnerSquare, targetSquare)) ||
      (pinnerType === 'q' &&
        (this.onSameDiagonal(pinnerSquare, targetSquare) ||
          this.onSameFileOrRank(pinnerSquare, targetSquare)));

    if (!canReach) return null;

    // Get squares between pinner and target
    const between = this.getSquaresBetween(pinnerSquare, targetSquare);

    // Find pieces on the line
    const piecesOnLine: { square: string; piece: string }[] = [];
    for (const sq of between) {
      const piece = this.getPieceAt(position, sq);
      if (piece) {
        piecesOnLine.push({ square: sq, piece });
      }
    }

    // For a pin, there must be exactly one piece between pinner and target
    if (piecesOnLine.length !== 1) return null;

    const pinnedInfo = piecesOnLine[0]!;
    const pinnedColor = this.getPieceColor(pinnedInfo.piece);

    // Pinned piece must belong to the defender
    if (pinnedColor !== defenderSide) return null;

    // Get target piece
    const targetPiece = this.getPieceAt(position, targetSquare);
    if (!targetPiece) return null;

    // For relative pin, pinned piece should be less valuable than target
    const pinnedValue = this.getPieceValue(pinnedInfo.piece);
    const targetValue = this.getPieceValue(targetPiece);

    if (!isAbsoluteCheck && pinnedValue >= targetValue) {
      return null; // Not a meaningful relative pin
    }

    return {
      pinnerSquare,
      pinnerPiece,
      pinnedSquare: pinnedInfo.square,
      pinnedPiece: pinnedInfo.piece,
      targetSquare,
      targetPiece,
      isAbsolute: isAbsoluteCheck,
      attackerSide,
      pinnedValue,
      targetValue,
    };
  }

  /**
   * Get all sliding pieces for a side
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
   * Get valuable pieces (queen, rook) for a side
   */
  private getValuablePieces(
    position: DetectorPosition,
    side: 'w' | 'b',
  ): { square: string; piece: string; value: number }[] {
    const pieces: { square: string; piece: string; value: number }[] = [];
    const pieceMap = side === 'w' ? position.pieces.white : position.pieces.black;

    for (const [pieceType, squares] of pieceMap) {
      if (pieceType === 'q' || pieceType === 'r') {
        for (const square of squares) {
          const piece = side === 'w' ? pieceType.toUpperCase() : pieceType;
          pieces.push({
            square,
            piece,
            value: this.getPieceValue(piece),
          });
        }
      }
    }

    // Sort by value (most valuable first)
    return pieces.sort((a, b) => b.value - a.value);
  }

  /**
   * Convert pin info to theme instance
   */
  private pinToTheme(pin: PinInfo, ply: number): ReturnType<typeof createThemeInstance> {
    const type: ThemeType = pin.isAbsolute ? 'absolute_pin' : 'relative_pin';
    const severity = this.calculatePinSeverity(pin);
    const confidence = pin.isAbsolute ? 1.0 : 0.85;

    const defenderSide = pin.attackerSide === 'w' ? 'b' : 'w';

    const pinnedPieceInfo: ThemePieceInfo = {
      type: pin.pinnedPiece.toLowerCase(),
      square: pin.pinnedSquare,
      color: defenderSide,
      role: 'pinned piece',
    };

    const pinnerPieceInfo: ThemePieceInfo = {
      type: pin.pinnerPiece.toLowerCase(),
      square: pin.pinnerSquare,
      color: pin.attackerSide,
      role: 'pinner',
    };

    const targetPieceInfo: ThemePieceInfo = {
      type: pin.targetPiece.toLowerCase(),
      square: pin.targetSquare,
      color: defenderSide,
      role: pin.isAbsolute ? 'king' : 'target',
    };

    const explanation = pin.isAbsolute
      ? `${this.pieceNameShort(pin.pinnedPiece)} is absolutely pinned to the king`
      : `${this.pieceNameShort(pin.pinnedPiece)} is pinned against the ${this.pieceNameShort(pin.targetPiece)}`;

    const detailedExplanation = pin.isAbsolute
      ? `The ${this.pieceName(pin.pinnerPiece)} on ${pin.pinnerSquare} pins the ${this.pieceName(pin.pinnedPiece)} on ${pin.pinnedSquare} to the king. The pinned piece cannot legally move.`
      : `The ${this.pieceName(pin.pinnerPiece)} on ${pin.pinnerSquare} pins the ${this.pieceName(pin.pinnedPiece)} on ${pin.pinnedSquare} against the ${this.pieceName(pin.targetPiece)} on ${pin.targetSquare}. Moving the pinned piece would lose material.`;

    return createThemeInstance(
      type,
      'tactical',
      pin.attackerSide,
      pin.pinnedSquare,
      severity,
      confidence,
      explanation,
      ply,
      {
        secondarySquares: [pin.pinnerSquare, pin.targetSquare],
        pieces: [pinnedPieceInfo, pinnerPieceInfo, targetPieceInfo],
        materialAtStake: pin.isAbsolute ? pin.pinnedValue : pin.pinnedValue,
        detailedExplanation,
      },
    );
  }

  /**
   * Calculate severity of a pin
   */
  private calculatePinSeverity(pin: PinInfo): ThemeSeverity {
    if (pin.isAbsolute) {
      // Absolute pins are generally significant
      if (pin.pinnedValue >= 500) return 'critical'; // Rook or queen
      if (pin.pinnedValue >= 300) return 'significant'; // Knight or bishop
      return 'moderate'; // Pawn
    } else {
      // Relative pins based on material difference
      const materialGain = pin.targetValue - pin.pinnedValue;
      if (materialGain >= 400) return 'critical';
      if (materialGain >= 200) return 'significant';
      if (materialGain >= 100) return 'moderate';
      return 'minor';
    }
  }

  /**
   * Get piece name for display
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
   * Get short piece name
   */
  private pieceNameShort(piece: string): string {
    const type = piece.toLowerCase();
    if (type === 'n') return 'knight';
    if (type === 'p') return 'pawn';
    return type.toUpperCase();
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

    // Check for emerged and persisting themes
    for (const theme of newThemes) {
      const prev = previousByKey.get(theme.themeKey);
      if (prev) {
        // Theme persists or escalated
        const isEscalated = this.severityLevel(theme.severity) > this.severityLevel(prev.severity);

        if (isEscalated) {
          deltas.push(
            createThemeDelta(theme, 'escalated', {
              previousStatus: prev.status,
              previousSeverity: prev.severity,
            }),
          );
        } else {
          deltas.push(
            createThemeDelta(theme, 'persisting', {
              previousStatus: prev.status,
            }),
          );
        }
      } else {
        // New theme emerged
        deltas.push(
          createThemeDelta(theme, 'emerged', {
            changeDescription: `${theme.type} detected on ${theme.primarySquare}`,
          }),
        );
      }
    }

    // Check for resolved themes
    for (const [key, prev] of previousByKey) {
      if (!newKeys.has(key)) {
        deltas.push(
          createThemeDelta({ ...prev, status: 'resolved' }, 'resolved', {
            previousStatus: prev.status,
            changeDescription: `${prev.type} resolved`,
          }),
        );
      }
    }

    return deltas;
  }

  /**
   * Get numeric severity level for comparison
   */
  private severityLevel(severity: ThemeSeverity): number {
    const levels: Record<ThemeSeverity, number> = {
      minor: 0,
      moderate: 1,
      significant: 2,
      critical: 3,
    };
    return levels[severity] ?? 0;
  }
}

/**
 * Create a pin detector instance
 */
export function createPinDetector(): PinDetector {
  return new PinDetector();
}
