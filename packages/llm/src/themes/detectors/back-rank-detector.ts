/**
 * Back Rank Detector
 *
 * Detects back rank weakness and back rank threats in chess positions.
 * A back rank weakness exists when the king is trapped on the back rank
 * with no escape squares, making it vulnerable to back rank mates.
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
 * Back rank weakness information
 */
interface BackRankInfo {
  /** Side with the weakness */
  weakSide: 'w' | 'b';
  /** King square */
  kingSquare: string;
  /** Squares blocking king's escape */
  blockingSquares: string[];
  /** Blocking pieces */
  blockingPieces: { square: string; piece: string }[];
  /** Potential attacking pieces */
  potentialAttackers: { square: string; piece: string }[];
  /** Whether there's an immediate threat */
  hasThreat: boolean;
  /** The back rank file(s) where attack could come */
  attackingFiles: string[];
}

/**
 * Detects back rank weaknesses and threats
 */
export class BackRankDetector extends BaseThemeDetector {
  readonly id = 'back-rank-detector';
  readonly name = 'Back Rank Detector';
  readonly themeTypes: ThemeType[] = ['back_rank_threat'];
  readonly category = 'tactical';
  readonly minimumTier = 'shallow';
  readonly priority = 92; // High priority - back rank mates are critical

  detect(context: DetectorContext): DetectorResult {
    const startTime = Date.now();
    const { position, ply, previousThemes } = context;

    const backRankIssues = this.findBackRankIssues(position);
    const themes = backRankIssues.map((issue) => this.backRankToTheme(issue, ply));

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
   * Find all back rank issues for both sides
   */
  private findBackRankIssues(position: DetectorPosition): BackRankInfo[] {
    const issues: BackRankInfo[] = [];

    // Check white's back rank (rank 1)
    const whiteIssue = this.checkBackRank(position, 'w');
    if (whiteIssue) issues.push(whiteIssue);

    // Check black's back rank (rank 8)
    const blackIssue = this.checkBackRank(position, 'b');
    if (blackIssue) issues.push(blackIssue);

    return issues;
  }

  /**
   * Check a side's back rank for weakness
   */
  private checkBackRank(position: DetectorPosition, side: 'w' | 'b'): BackRankInfo | null {
    const backRank = side === 'w' ? '1' : '8';
    const kingSquare = side === 'w' ? position.whiteKingSquare : position.blackKingSquare;

    // King must be on back rank for this weakness
    if (!kingSquare.endsWith(backRank)) return null;

    const kingFile = kingSquare[0]!;
    const secondRank = side === 'w' ? '2' : '7';

    // Check escape squares on second rank
    const escapeSquares = this.getAdjacentFiles(kingFile).map((f) => f + secondRank);
    escapeSquares.push(kingFile + secondRank); // Directly in front

    const blockingPieces: { square: string; piece: string }[] = [];
    const blockingSquares: string[] = [];

    let hasEscape = false;
    for (const square of escapeSquares) {
      const piece = this.getPieceAt(position, square);
      if (!piece) {
        // Empty square - check if it's attacked by opponent
        const opponentSide = side === 'w' ? 'b' : 'w';
        if (!this.isSquareAttacked(position, square, opponentSide)) {
          hasEscape = true;
        }
      } else {
        const pieceColor = this.getPieceColor(piece);
        if (pieceColor === side) {
          blockingSquares.push(square);
          blockingPieces.push({ square, piece });
        }
      }
    }

    // If king has escape, no weakness
    if (hasEscape) return null;

    // Find potential attackers (opponent rooks and queens)
    const opponentSide = side === 'w' ? 'b' : 'w';
    const potentialAttackers = this.findBackRankAttackers(position, opponentSide, backRank);

    // Check if there's an immediate threat
    const hasThreat =
      potentialAttackers.length > 0 &&
      this.canAttackBackRank(position, potentialAttackers, kingSquare, opponentSide);

    // Determine attacking files
    const attackingFiles = potentialAttackers
      .filter((a) => this.canReachBackRank(position, a.square, backRank))
      .map((a) => a.square[0]!)
      .filter((f, i, arr) => arr.indexOf(f) === i);

    return {
      weakSide: side,
      kingSquare,
      blockingSquares,
      blockingPieces,
      potentialAttackers,
      hasThreat,
      attackingFiles,
    };
  }

  /**
   * Get adjacent files to a given file
   */
  private getAdjacentFiles(file: string): string[] {
    const files = 'abcdefgh';
    const idx = files.indexOf(file);
    const result: string[] = [];
    if (idx > 0) result.push(files[idx - 1]!);
    if (idx < 7) result.push(files[idx + 1]!);
    return result;
  }

  /**
   * Check if square is attacked by a side
   */
  private isSquareAttacked(position: DetectorPosition, square: string, byWhom: 'w' | 'b'): boolean {
    // Simplified attack detection
    const pieceMap = byWhom === 'w' ? position.pieces.white : position.pieces.black;

    // Check pawn attacks
    const pawns = pieceMap.get('p') ?? [];
    const pawnDir = byWhom === 'w' ? -1 : 1;
    for (const pawnSq of pawns) {
      const attackSquares = [
        this.offsetSquare(pawnSq, pawnDir, -1),
        this.offsetSquare(pawnSq, pawnDir, 1),
      ];
      if (attackSquares.includes(square)) return true;
    }

    // Check knight attacks
    const knights = pieceMap.get('n') ?? [];
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
    for (const knightSq of knights) {
      for (const [dr, dc] of knightMoves) {
        if (this.offsetSquare(knightSq, dr, dc) === square) return true;
      }
    }

    // Check sliding piece attacks (simplified - doesn't check blocking)
    const bishops = pieceMap.get('b') ?? [];
    const rooks = pieceMap.get('r') ?? [];
    const queens = pieceMap.get('q') ?? [];

    for (const bSq of bishops) {
      if (this.onSameDiagonal(bSq, square)) return true;
    }
    for (const rSq of rooks) {
      if (this.onSameFileOrRank(rSq, square)) return true;
    }
    for (const qSq of queens) {
      if (this.onSameDiagonal(qSq, square) || this.onSameFileOrRank(qSq, square)) {
        return true;
      }
    }

    // Check king attacks
    const kingSquare = byWhom === 'w' ? position.whiteKingSquare : position.blackKingSquare;
    if (this.isAdjacent(kingSquare, square)) return true;

    return false;
  }

  /**
   * Check if two squares are adjacent
   */
  private isAdjacent(sq1: string, sq2: string): boolean {
    const fileDiff = Math.abs(sq1.charCodeAt(0) - sq2.charCodeAt(0));
    const rankDiff = Math.abs(parseInt(sq1[1]!) - parseInt(sq2[1]!));
    return fileDiff <= 1 && rankDiff <= 1 && !(fileDiff === 0 && rankDiff === 0);
  }

  /**
   * Find potential back rank attackers
   */
  private findBackRankAttackers(
    position: DetectorPosition,
    attackerSide: 'w' | 'b',
    _backRank: string,
  ): { square: string; piece: string }[] {
    const attackers: { square: string; piece: string }[] = [];
    const pieceMap = attackerSide === 'w' ? position.pieces.white : position.pieces.black;

    // Rooks and queens can attack the back rank
    for (const pieceType of ['r', 'q']) {
      const squares = pieceMap.get(pieceType) ?? [];
      for (const square of squares) {
        const piece = attackerSide === 'w' ? pieceType.toUpperCase() : pieceType;
        attackers.push({ square, piece });
      }
    }

    return attackers;
  }

  /**
   * Check if attackers can reach the back rank
   */
  private canAttackBackRank(
    position: DetectorPosition,
    attackers: { square: string; piece: string }[],
    kingSquare: string,
    attackerSide: 'w' | 'b',
  ): boolean {
    const backRank = kingSquare[1]!;

    for (const attacker of attackers) {
      // Check if attacker can reach king's file on back rank
      const targetSquare = kingSquare[0]! + backRank;
      if (this.canReachSquare(position, attacker.square, targetSquare, attackerSide)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a rook/queen can reach a square
   */
  private canReachSquare(
    position: DetectorPosition,
    from: string,
    to: string,
    _side: 'w' | 'b',
  ): boolean {
    if (!this.onSameFileOrRank(from, to)) return false;

    const between = this.getSquaresBetween(from, to);
    for (const sq of between) {
      const piece = this.getPieceAt(position, sq);
      if (piece) return false; // Blocked
    }

    return true;
  }

  /**
   * Check if piece can reach the back rank
   */
  private canReachBackRank(
    position: DetectorPosition,
    pieceSquare: string,
    backRank: string,
  ): boolean {
    const pieceFile = pieceSquare[0]!;

    // If already on a file that can reach the back rank
    const targetSquare = pieceFile + backRank;

    // Check if path is clear
    const between = this.getSquaresBetween(pieceSquare, targetSquare);
    for (const sq of between) {
      if (this.getPieceAt(position, sq)) return false;
    }

    return true;
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
   * Convert back rank issue to theme instance
   */
  private backRankToTheme(
    issue: BackRankInfo,
    ply: number,
  ): ReturnType<typeof createThemeInstance> {
    const severity = this.calculateBackRankSeverity(issue);
    const confidence = issue.hasThreat ? 0.95 : 0.8;
    const beneficiary = issue.weakSide === 'w' ? 'b' : 'w';

    const pieces: ThemePieceInfo[] = [
      {
        type: 'k',
        square: issue.kingSquare,
        color: issue.weakSide,
        role: 'vulnerable king',
      },
      ...issue.blockingPieces.map((p) => ({
        type: p.piece.toLowerCase(),
        square: p.square,
        color: issue.weakSide as 'w' | 'b',
        role: 'blocking piece',
      })),
      ...issue.potentialAttackers.map((a) => ({
        type: a.piece.toLowerCase(),
        square: a.square,
        color: beneficiary as 'w' | 'b',
        role: 'attacker',
      })),
    ];

    const explanation = issue.hasThreat
      ? `Back rank threat: king trapped, mate possible`
      : `Back rank weakness: king has no escape squares`;

    const detailedExplanation = issue.hasThreat
      ? `The ${issue.weakSide === 'w' ? 'white' : 'black'} king on ${issue.kingSquare} is trapped on the back rank. ` +
        `The ${issue.potentialAttackers.map((a) => this.pieceName(a.piece)).join(' and ')} can deliver checkmate.`
      : `The ${issue.weakSide === 'w' ? 'white' : 'black'} king on ${issue.kingSquare} lacks escape squares. ` +
        `The pieces on ${issue.blockingSquares.join(', ')} prevent the king from moving to the second rank.`;

    return createThemeInstance(
      'back_rank_threat',
      'tactical',
      beneficiary,
      issue.kingSquare,
      severity,
      confidence,
      explanation,
      ply,
      {
        secondarySquares: [
          ...issue.blockingSquares,
          ...issue.potentialAttackers.map((a) => a.square),
        ],
        pieces,
        detailedExplanation,
      },
    );
  }

  /**
   * Calculate back rank severity
   */
  private calculateBackRankSeverity(issue: BackRankInfo): ThemeSeverity {
    if (issue.hasThreat && issue.potentialAttackers.length > 0) {
      return 'critical';
    }
    if (issue.potentialAttackers.length > 0) {
      return 'significant';
    }
    return 'moderate';
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
        const isEscalated = this.severityLevel(theme.severity) > this.severityLevel(prev.severity);
        if (isEscalated) {
          deltas.push(
            createThemeDelta(theme, 'escalated', {
              previousStatus: prev.status,
              previousSeverity: prev.severity,
            }),
          );
        } else {
          deltas.push(createThemeDelta(theme, 'persisting', { previousStatus: prev.status }));
        }
      } else {
        deltas.push(
          createThemeDelta(theme, 'emerged', {
            changeDescription: 'back rank weakness detected',
          }),
        );
      }
    }

    for (const [key, prev] of previousByKey) {
      if (!newKeys.has(key)) {
        deltas.push(
          createThemeDelta({ ...prev, status: 'resolved' }, 'resolved', {
            previousStatus: prev.status,
            changeDescription: 'back rank weakness resolved',
          }),
        );
      }
    }

    return deltas;
  }

  /**
   * Get severity level for comparison
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
 * Create a back rank detector instance
 */
export function createBackRankDetector(): BackRankDetector {
  return new BackRankDetector();
}
