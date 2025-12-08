/**
 * Fork Detector
 *
 * Detects forks (double attacks) in chess positions.
 * Includes knight forks, pawn forks, and queen forks.
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
 * Fork information
 */
interface ForkInfo {
  /** Forking piece square */
  forkerSquare: string;
  /** Forking piece */
  forkerPiece: string;
  /** Target squares and pieces */
  targets: { square: string; piece: string; value: number }[];
  /** Attacker side */
  attackerSide: 'w' | 'b';
  /** Total material at stake */
  materialAtStake: number;
  /** Is the king one of the targets? */
  includesKing: boolean;
  /** Fork type description */
  forkType: 'knight' | 'pawn' | 'queen' | 'bishop' | 'rook';
}

/**
 * Detects forks in chess positions
 */
export class ForkDetector extends BaseThemeDetector {
  readonly id = 'fork-detector';
  readonly name = 'Fork Detector';
  readonly themeTypes: ThemeType[] = ['fork', 'double_attack'];
  readonly category = 'tactical';
  readonly minimumTier = 'shallow';
  readonly priority = 85; // High priority - forks are common and important

  detect(context: DetectorContext): DetectorResult {
    const startTime = Date.now();
    const { position, ply, previousThemes } = context;

    const forks = this.findAllForks(position);
    const themes = forks.map((fork) => this.forkToTheme(fork, ply));

    // Compute deltas
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
   * Find all forks in the position
   */
  private findAllForks(position: DetectorPosition): ForkInfo[] {
    const forks: ForkInfo[] = [];

    for (const side of ['w', 'b'] as const) {
      // Knight forks
      forks.push(...this.findKnightForks(position, side));

      // Pawn forks
      forks.push(...this.findPawnForks(position, side));

      // Queen forks
      forks.push(...this.findQueenForks(position, side));

      // Bishop forks (diagonal double attacks)
      forks.push(...this.findBishopForks(position, side));

      // Rook forks (file/rank double attacks)
      forks.push(...this.findRookForks(position, side));
    }

    return forks;
  }

  /**
   * Find knight forks
   */
  private findKnightForks(position: DetectorPosition, side: 'w' | 'b'): ForkInfo[] {
    const forks: ForkInfo[] = [];
    const pieceMap = side === 'w' ? position.pieces.white : position.pieces.black;
    const knightSquares = pieceMap.get('n') ?? [];
    const opposingSide = side === 'w' ? 'b' : 'w';

    for (const knightSquare of knightSquares) {
      const [kf, kr] = this.squareToCoords(knightSquare);

      // Get all squares the knight attacks
      const knightMoves: [number, number][] = [
        [1, 2],
        [2, 1],
        [2, -1],
        [1, -2],
        [-1, -2],
        [-2, -1],
        [-2, 1],
        [-1, 2],
      ];

      const targets: { square: string; piece: string; value: number }[] = [];

      for (const [df, dr] of knightMoves) {
        const f = kf + df;
        const r = kr + dr;

        if (!this.isValidSquare(f, r)) continue;

        const targetSquare = this.coordsToSquare(f, r);
        const targetPiece = this.getPieceAt(position, targetSquare);

        if (targetPiece && this.getPieceColor(targetPiece) === opposingSide) {
          targets.push({
            square: targetSquare,
            piece: targetPiece,
            value: this.getPieceValue(targetPiece),
          });
        }
      }

      // A fork requires at least 2 targets
      if (targets.length >= 2) {
        // Sort by value and take top targets
        targets.sort((a, b) => b.value - a.value);

        const knightPiece = side === 'w' ? 'N' : 'n';
        const includesKing = targets.some((t) => t.piece.toLowerCase() === 'k');
        const materialAtStake = includesKing
          ? (targets[1]?.value ?? 0) // If king included, second target is what's actually lost
          : (targets[0]?.value ?? 0);

        // Only significant forks (attacking valuable pieces)
        if (materialAtStake >= 100 || includesKing) {
          forks.push({
            forkerSquare: knightSquare,
            forkerPiece: knightPiece,
            targets: targets.slice(0, 3), // Max 3 targets
            attackerSide: side,
            materialAtStake,
            includesKing,
            forkType: 'knight',
          });
        }
      }
    }

    return forks;
  }

  /**
   * Find pawn forks
   */
  private findPawnForks(position: DetectorPosition, side: 'w' | 'b'): ForkInfo[] {
    const forks: ForkInfo[] = [];
    const pieceMap = side === 'w' ? position.pieces.white : position.pieces.black;
    const pawnSquares = pieceMap.get('p') ?? [];
    const opposingSide = side === 'w' ? 'b' : 'w';
    const direction = side === 'w' ? 1 : -1;

    for (const pawnSquare of pawnSquares) {
      const [pf, pr] = this.squareToCoords(pawnSquare);

      // Pawn attack squares
      const attackSquares = [
        { f: pf - 1, r: pr + direction },
        { f: pf + 1, r: pr + direction },
      ].filter((sq) => this.isValidSquare(sq.f, sq.r));

      const targets: { square: string; piece: string; value: number }[] = [];

      for (const sq of attackSquares) {
        const targetSquare = this.coordsToSquare(sq.f, sq.r);
        const targetPiece = this.getPieceAt(position, targetSquare);

        if (targetPiece && this.getPieceColor(targetPiece) === opposingSide) {
          targets.push({
            square: targetSquare,
            piece: targetPiece,
            value: this.getPieceValue(targetPiece),
          });
        }
      }

      // Pawn fork requires exactly 2 targets
      if (targets.length === 2) {
        const pawnPiece = side === 'w' ? 'P' : 'p';
        const includesKing = targets.some((t) => t.piece.toLowerCase() === 'k');
        const materialAtStake = Math.min(targets[0]!.value, targets[1]!.value);

        // Pawn forks of valuable pieces only
        if (materialAtStake >= 300 || includesKing) {
          forks.push({
            forkerSquare: pawnSquare,
            forkerPiece: pawnPiece,
            targets,
            attackerSide: side,
            materialAtStake,
            includesKing,
            forkType: 'pawn',
          });
        }
      }
    }

    return forks;
  }

  /**
   * Find queen forks
   */
  private findQueenForks(position: DetectorPosition, side: 'w' | 'b'): ForkInfo[] {
    const forks: ForkInfo[] = [];
    const pieceMap = side === 'w' ? position.pieces.white : position.pieces.black;
    const queenSquares = pieceMap.get('q') ?? [];
    const opposingSide = side === 'w' ? 'b' : 'w';

    for (const queenSquare of queenSquares) {
      const targets = this.findSlidingAttackTargets(position, queenSquare, 'q', opposingSide);

      // Queen fork requires multiple high-value targets
      if (targets.length >= 2) {
        targets.sort((a, b) => b.value - a.value);

        const queenPiece = side === 'w' ? 'Q' : 'q';
        const includesKing = targets.some((t) => t.piece.toLowerCase() === 'k');
        const materialAtStake = includesKing ? (targets[1]?.value ?? 0) : (targets[0]?.value ?? 0);

        // Only report queen forks on valuable pieces
        if (materialAtStake >= 300 || includesKing) {
          forks.push({
            forkerSquare: queenSquare,
            forkerPiece: queenPiece,
            targets: targets.slice(0, 3),
            attackerSide: side,
            materialAtStake,
            includesKing,
            forkType: 'queen',
          });
        }
      }
    }

    return forks;
  }

  /**
   * Find bishop double attacks
   */
  private findBishopForks(position: DetectorPosition, side: 'w' | 'b'): ForkInfo[] {
    const forks: ForkInfo[] = [];
    const pieceMap = side === 'w' ? position.pieces.white : position.pieces.black;
    const bishopSquares = pieceMap.get('b') ?? [];
    const opposingSide = side === 'w' ? 'b' : 'w';

    for (const bishopSquare of bishopSquares) {
      const targets = this.findSlidingAttackTargets(position, bishopSquare, 'b', opposingSide);

      if (targets.length >= 2) {
        targets.sort((a, b) => b.value - a.value);

        const bishopPiece = side === 'w' ? 'B' : 'b';
        const includesKing = targets.some((t) => t.piece.toLowerCase() === 'k');
        const materialAtStake = includesKing ? (targets[1]?.value ?? 0) : (targets[0]?.value ?? 0);

        if (materialAtStake >= 300 || includesKing) {
          forks.push({
            forkerSquare: bishopSquare,
            forkerPiece: bishopPiece,
            targets: targets.slice(0, 3),
            attackerSide: side,
            materialAtStake,
            includesKing,
            forkType: 'bishop',
          });
        }
      }
    }

    return forks;
  }

  /**
   * Find rook double attacks
   */
  private findRookForks(position: DetectorPosition, side: 'w' | 'b'): ForkInfo[] {
    const forks: ForkInfo[] = [];
    const pieceMap = side === 'w' ? position.pieces.white : position.pieces.black;
    const rookSquares = pieceMap.get('r') ?? [];
    const opposingSide = side === 'w' ? 'b' : 'w';

    for (const rookSquare of rookSquares) {
      const targets = this.findSlidingAttackTargets(position, rookSquare, 'r', opposingSide);

      if (targets.length >= 2) {
        targets.sort((a, b) => b.value - a.value);

        const rookPiece = side === 'w' ? 'R' : 'r';
        const includesKing = targets.some((t) => t.piece.toLowerCase() === 'k');
        const materialAtStake = includesKing ? (targets[1]?.value ?? 0) : (targets[0]?.value ?? 0);

        if (materialAtStake >= 300 || includesKing) {
          forks.push({
            forkerSquare: rookSquare,
            forkerPiece: rookPiece,
            targets: targets.slice(0, 3),
            attackerSide: side,
            materialAtStake,
            includesKing,
            forkType: 'rook',
          });
        }
      }
    }

    return forks;
  }

  /**
   * Find targets attacked by a sliding piece
   */
  private findSlidingAttackTargets(
    position: DetectorPosition,
    fromSquare: string,
    pieceType: string,
    targetSide: 'w' | 'b',
  ): { square: string; piece: string; value: number }[] {
    const targets: { square: string; piece: string; value: number }[] = [];
    const directions = this.getAttackDirections(pieceType);
    const [startF, startR] = this.squareToCoords(fromSquare);

    for (const [df, dr] of directions) {
      let f = startF + df;
      let r = startR + dr;

      while (this.isValidSquare(f, r)) {
        const square = this.coordsToSquare(f, r);
        const piece = this.getPieceAt(position, square);

        if (piece) {
          if (this.getPieceColor(piece) === targetSide) {
            targets.push({
              square,
              piece,
              value: this.getPieceValue(piece),
            });
          }
          break; // Blocked by piece
        }

        f += df;
        r += dr;
      }
    }

    return targets;
  }

  /**
   * Convert fork to theme instance
   */
  private forkToTheme(fork: ForkInfo, ply: number): ReturnType<typeof createThemeInstance> {
    const type: ThemeType = fork.targets.length > 2 ? 'double_attack' : 'fork';
    const severity = this.calculateForkSeverity(fork);
    const confidence = fork.includesKing ? 0.95 : 0.85;

    const targetSide = fork.attackerSide === 'w' ? 'b' : 'w';

    const pieces: ThemePieceInfo[] = [
      {
        type: fork.forkerPiece.toLowerCase(),
        square: fork.forkerSquare,
        color: fork.attackerSide,
        role: 'attacker',
      },
      ...fork.targets.map((t) => ({
        type: t.piece.toLowerCase(),
        square: t.square,
        color: targetSide as 'w' | 'b',
        role: 'target',
      })),
    ];

    const targetNames = fork.targets.map((t) => this.pieceName(t.piece)).join(' and ');
    const explanation = `${this.pieceNameCap(fork.forkerPiece)} ${fork.forkType} fork attacks ${targetNames}`;

    const detailedExplanation =
      `The ${this.pieceName(fork.forkerPiece)} on ${fork.forkerSquare} ` +
      `attacks both ${fork.targets.map((t) => `the ${this.pieceName(t.piece)} on ${t.square}`).join(' and ')}. ` +
      (fork.includesKing
        ? `Since the king is attacked, the ${this.pieceName(fork.targets.find((t) => t.piece.toLowerCase() !== 'k')?.piece ?? '')} will be lost.`
        : `One of the pieces will be lost.`);

    return createThemeInstance(
      type,
      'tactical',
      fork.attackerSide,
      fork.forkerSquare,
      severity,
      confidence,
      explanation,
      ply,
      {
        secondarySquares: fork.targets.map((t) => t.square),
        pieces,
        materialAtStake: fork.materialAtStake,
        detailedExplanation,
      },
    );
  }

  /**
   * Calculate fork severity
   */
  private calculateForkSeverity(fork: ForkInfo): ThemeSeverity {
    if (fork.includesKing) {
      if (fork.materialAtStake >= 500) return 'critical';
      return 'significant';
    }

    if (fork.materialAtStake >= 500) return 'critical';
    if (fork.materialAtStake >= 300) return 'significant';
    if (fork.materialAtStake >= 100) return 'moderate';
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
            changeDescription: `${theme.type} detected`,
          }),
        );
      }
    }

    for (const [key, prev] of previousByKey) {
      if (!newKeys.has(key)) {
        deltas.push(
          createThemeDelta({ ...prev, status: 'resolved' }, 'resolved', {
            previousStatus: prev.status,
          }),
        );
      }
    }

    return deltas;
  }
}

/**
 * Create a fork detector instance
 */
export function createForkDetector(): ForkDetector {
  return new ForkDetector();
}
