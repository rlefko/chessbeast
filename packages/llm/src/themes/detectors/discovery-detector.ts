/**
 * Discovery Detector
 *
 * Detects discovered attacks and discovered checks in chess positions.
 * A discovered attack occurs when moving one piece reveals an attack
 * from another piece behind it.
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
 * Discovery information
 */
interface DiscoveryInfo {
  /** Moving piece square */
  moverSquare: string;
  /** Moving piece type */
  moverPiece: string;
  /** Hidden attacker square */
  attackerSquare: string;
  /** Hidden attacker piece type */
  attackerPiece: string;
  /** Target square */
  targetSquare: string;
  /** Target piece type */
  targetPiece: string;
  /** Attacker side */
  attackerSide: 'w' | 'b';
  /** Is this a discovered check? */
  isCheck: boolean;
  /** Material value of target */
  targetValue: number;
  /** Potential best squares for the moving piece */
  moverDestinations: string[];
}

/**
 * Detects discovered attacks in chess positions
 */
export class DiscoveryDetector extends BaseThemeDetector {
  readonly id = 'discovery-detector';
  readonly name = 'Discovery Detector';
  readonly themeTypes: ThemeType[] = ['discovered_attack'];
  readonly category = 'tactical';
  readonly minimumTier = 'shallow';
  readonly priority = 88;

  detect(context: DetectorContext): DetectorResult {
    const startTime = Date.now();
    const { position, ply, previousThemes } = context;

    const discoveries = this.findAllDiscoveries(position);
    const themes = discoveries.map((discovery) => this.discoveryToTheme(discovery, ply));

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
   * Find all potential discovered attacks
   */
  private findAllDiscoveries(position: DetectorPosition): DiscoveryInfo[] {
    const discoveries: DiscoveryInfo[] = [];

    for (const attackerSide of ['w', 'b'] as const) {
      const defenderSide = attackerSide === 'w' ? 'b' : 'w';

      // Get sliding pieces that could be hidden attackers
      const sliders = this.getSlidingPieces(position, attackerSide);

      for (const slider of sliders) {
        const directions = this.getDirectionsForPiece(slider.piece);

        for (const dir of directions) {
          const discovery = this.checkDiscoveryInDirection(
            position,
            slider.square,
            slider.piece,
            dir,
            attackerSide,
            defenderSide,
          );
          if (discovery) {
            discoveries.push(discovery);
          }
        }
      }
    }

    return discoveries;
  }

  /**
   * Check for a discovered attack potential in a direction
   */
  private checkDiscoveryInDirection(
    position: DetectorPosition,
    attackerSquare: string,
    attackerPiece: string,
    direction: [number, number],
    attackerSide: 'w' | 'b',
    defenderSide: 'w' | 'b',
  ): DiscoveryInfo | null {
    const [dr, dc] = direction;
    let currentSquare = attackerSquare;
    let blocker: { square: string; piece: string } | null = null;
    let target: { square: string; piece: string } | null = null;

    // Traverse in the direction (max 7 squares in any direction)
    for (let step = 0; step < 7; step++) {
      const nextSquare = this.offsetSquare(currentSquare, dr, dc);
      if (!nextSquare) break;
      currentSquare = nextSquare;

      const piece = this.getPieceAt(position, currentSquare);
      if (!piece) continue;

      const pieceColor = this.getPieceColor(piece);

      if (!blocker) {
        // First piece found - must be own piece to be a blocker
        if (pieceColor !== attackerSide) break;
        // The blocker should be a piece that can move (not the attacking slider itself)
        blocker = { square: currentSquare, piece };
      } else {
        // Second piece found - must be opponent's piece to be a target
        if (pieceColor !== defenderSide) break;
        target = { square: currentSquare, piece };
        break;
      }
    }

    if (!blocker || !target) return null;

    const targetValue = this.getPieceValue(target.piece);
    const isCheck = target.piece.toLowerCase() === 'k';

    // Only count discoveries that are meaningful
    // (target is valuable or it's a discovered check)
    if (!isCheck && targetValue < 100) return null;

    // Get potential destinations for the moving piece
    const moverDestinations = this.getMoverDestinations(
      position,
      blocker.square,
      blocker.piece,
      attackerSide,
    );

    return {
      moverSquare: blocker.square,
      moverPiece: blocker.piece,
      attackerSquare,
      attackerPiece,
      targetSquare: target.square,
      targetPiece: target.piece,
      attackerSide,
      isCheck,
      targetValue,
      moverDestinations,
    };
  }

  /**
   * Get potential destination squares for the moving piece
   */
  private getMoverDestinations(
    position: DetectorPosition,
    square: string,
    piece: string,
    side: 'w' | 'b',
  ): string[] {
    const destinations: string[] = [];
    const pieceType = piece.toLowerCase();

    // Simple approximation of legal moves
    if (pieceType === 'n') {
      const knightMoves: [number, number][] = [
        [2, 1],
        [2, -1],
        [-2, 1],
        [-2, -1],
        [1, 2],
        [1, -2],
        [-1, 2],
        [-1, -2],
      ];
      for (const [dr, dc] of knightMoves) {
        const dest = this.offsetSquare(square, dr, dc);
        if (dest && !this.hasOwnPiece(position, dest, side)) {
          destinations.push(dest);
        }
      }
    } else if (pieceType === 'p') {
      // Pawn capture squares (for discovery, pawn attacks are often best)
      const dir = side === 'w' ? 1 : -1;
      const capLeft = this.offsetSquare(square, dir, -1);
      const capRight = this.offsetSquare(square, dir, 1);
      if (capLeft && this.hasOpponentPiece(position, capLeft, side)) {
        destinations.push(capLeft);
      }
      if (capRight && this.hasOpponentPiece(position, capRight, side)) {
        destinations.push(capRight);
      }
    } else {
      // For other pieces, get basic moves
      const directions = this.getDirectionsForPiece(piece);
      for (const [dr, dc] of directions) {
        const dest = this.offsetSquare(square, dr, dc);
        if (dest && !this.hasOwnPiece(position, dest, side)) {
          destinations.push(dest);
        }
      }
    }

    return destinations.slice(0, 4); // Limit to 4 best
  }

  /**
   * Check if square has own piece
   */
  private hasOwnPiece(position: DetectorPosition, square: string, side: 'w' | 'b'): boolean {
    const piece = this.getPieceAt(position, square);
    if (!piece) return false;
    return this.getPieceColor(piece) === side;
  }

  /**
   * Check if square has opponent piece
   */
  private hasOpponentPiece(position: DetectorPosition, square: string, side: 'w' | 'b'): boolean {
    const piece = this.getPieceAt(position, square);
    if (!piece) return false;
    return this.getPieceColor(piece) !== side;
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
   * Convert discovery to theme instance
   */
  private discoveryToTheme(
    discovery: DiscoveryInfo,
    ply: number,
  ): ReturnType<typeof createThemeInstance> {
    const severity = this.calculateDiscoverySeverity(discovery);
    const confidence = discovery.isCheck ? 0.9 : 0.8;
    const defenderSide = discovery.attackerSide === 'w' ? 'b' : 'w';

    const pieces: ThemePieceInfo[] = [
      {
        type: discovery.moverPiece.toLowerCase(),
        square: discovery.moverSquare,
        color: discovery.attackerSide,
        role: 'mover',
      },
      {
        type: discovery.attackerPiece.toLowerCase(),
        square: discovery.attackerSquare,
        color: discovery.attackerSide,
        role: 'hidden attacker',
      },
      {
        type: discovery.targetPiece.toLowerCase(),
        square: discovery.targetSquare,
        color: defenderSide,
        role: 'target',
      },
    ];

    const explanation = discovery.isCheck
      ? `Discovered check potential: ${this.pieceName(discovery.moverPiece)} uncovers ${this.pieceName(discovery.attackerPiece)} attack on king`
      : `Discovered attack: ${this.pieceName(discovery.moverPiece)} can reveal ${this.pieceName(discovery.attackerPiece)} attack on ${this.pieceName(discovery.targetPiece)}`;

    const detailedExplanation =
      `Moving the ${this.pieceName(discovery.moverPiece)} on ${discovery.moverSquare} ` +
      `would reveal an attack from the ${this.pieceName(discovery.attackerPiece)} on ${discovery.attackerSquare} ` +
      `against the ${this.pieceName(discovery.targetPiece)} on ${discovery.targetSquare}. ` +
      (discovery.isCheck
        ? `This would be a discovered check, forcing the king to address the threat.`
        : `This creates a double attack since the moving piece can also threaten something.`);

    return createThemeInstance(
      'discovered_attack',
      'tactical',
      discovery.attackerSide,
      discovery.moverSquare,
      severity,
      confidence,
      explanation,
      ply,
      {
        secondarySquares: [discovery.attackerSquare, discovery.targetSquare],
        pieces,
        materialAtStake: discovery.targetValue,
        detailedExplanation,
      },
    );
  }

  /**
   * Calculate discovery severity
   */
  private calculateDiscoverySeverity(discovery: DiscoveryInfo): ThemeSeverity {
    if (discovery.isCheck) {
      return 'critical'; // Discovered checks are always critical
    }

    if (discovery.targetValue >= 500) return 'critical';
    if (discovery.targetValue >= 300) return 'significant';
    if (discovery.targetValue >= 100) return 'moderate';
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
            changeDescription: `discovered attack detected`,
          }),
        );
      }
    }

    for (const [key, prev] of previousByKey) {
      if (!newKeys.has(key)) {
        deltas.push(
          createThemeDelta({ ...prev, status: 'resolved' }, 'resolved', {
            previousStatus: prev.status,
            changeDescription: 'discovered attack resolved',
          }),
        );
      }
    }

    return deltas;
  }
}

/**
 * Create a discovery detector instance
 */
export function createDiscoveryDetector(): DiscoveryDetector {
  return new DiscoveryDetector();
}
