/**
 * Positional Theme Detector
 *
 * Detects positional features including:
 * - Outposts (squares that cannot be attacked by enemy pawns)
 * - Weak squares / weak complexes
 * - Bishop pair advantage
 * - Bad bishops (blocked by own pawns)
 * - Space advantage
 * - Piece activity
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
 * Positional feature info
 */
interface PositionalFeature {
  type:
    | 'outpost'
    | 'weak_square'
    | 'weak_complex'
    | 'bishop_pair'
    | 'bad_bishop'
    | 'space_advantage'
    | 'piece_activity';
  beneficiary: 'w' | 'b';
  squares: string[];
  pieces?: { square: string; piece: string }[];
  magnitude?: number;
}

/**
 * Detects positional features
 */
export class PositionalDetector extends BaseThemeDetector {
  readonly id = 'positional-detector';
  readonly name = 'Positional Detector';
  readonly themeTypes: ThemeType[] = [
    'outpost',
    'weak_square',
    'weak_complex',
    'bishop_pair',
    'bad_bishop',
    'space_advantage',
    'piece_activity',
  ];
  readonly category = 'positional';
  readonly minimumTier = 'shallow';
  readonly priority = 60;

  detect(context: DetectorContext): DetectorResult {
    const startTime = Date.now();
    const { position, ply, previousThemes } = context;

    const features = this.findAllPositionalFeatures(position);
    const themes = features.map((feature) => this.featureToTheme(feature, ply));

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
   * Find all positional features
   */
  private findAllPositionalFeatures(position: DetectorPosition): PositionalFeature[] {
    const features: PositionalFeature[] = [];

    // Find outposts for both sides
    features.push(...this.findOutposts(position));

    // Find weak squares and complexes
    features.push(...this.findWeakSquares(position));

    // Check bishop pair
    features.push(...this.findBishopPair(position));

    // Find bad bishops
    features.push(...this.findBadBishops(position));

    // Check space advantage
    features.push(...this.findSpaceAdvantage(position));

    return features;
  }

  /**
   * Find outposts - squares controlled by pawns that enemy pawns can't attack
   */
  private findOutposts(position: DetectorPosition): PositionalFeature[] {
    const features: PositionalFeature[] = [];
    const files = 'abcdefgh';

    for (const side of ['w', 'b'] as const) {
      const oppSide = side === 'w' ? 'b' : 'w';
      const pieceMap = side === 'w' ? position.pieces.white : position.pieces.black;
      const oppPieceMap = side === 'w' ? position.pieces.black : position.pieces.white;
      const pawnSquares = pieceMap.get('p') ?? [];
      const oppPawnSquares = oppPieceMap.get('p') ?? [];

      // Outpost ranks for each side
      const outpostRanks = side === 'w' ? [4, 5, 6] : [3, 4, 5];

      for (const rank of outpostRanks) {
        for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
          const file = files[fileIdx]!;
          const square = file + rank;

          // Check if square is controlled by friendly pawn
          if (!this.isControlledByPawn(square, pawnSquares, side)) continue;

          // Check if enemy pawns can ever attack this square
          if (this.canEnemyPawnsAttack(square, oppPawnSquares, oppSide)) continue;

          // Check if there's a piece occupying this outpost
          const occupant = this.getPieceAt(position, square);
          if (occupant) {
            const occupantColor = this.getPieceColor(occupant);
            const occupantType = occupant.toLowerCase();
            // Knight or bishop on outpost is strongest
            if (occupantColor === side && (occupantType === 'n' || occupantType === 'b')) {
              features.push({
                type: 'outpost',
                beneficiary: side,
                squares: [square],
                pieces: [{ square, piece: occupant }],
              });
            }
          } else {
            // Empty outpost is still valuable
            features.push({
              type: 'outpost',
              beneficiary: side,
              squares: [square],
            });
          }
        }
      }
    }

    return features;
  }

  /**
   * Check if a square is controlled by a pawn
   */
  private isControlledByPawn(square: string, pawnSquares: string[], side: 'w' | 'b'): boolean {
    const files = 'abcdefgh';
    const file = square[0]!;
    const rank = parseInt(square[1]!);
    const fileIdx = files.indexOf(file);

    const pawnRank = side === 'w' ? rank - 1 : rank + 1;
    if (pawnRank < 1 || pawnRank > 8) return false;

    // Check if pawns on adjacent files control this square
    for (const offset of [-1, 1]) {
      const adjFileIdx = fileIdx + offset;
      if (adjFileIdx < 0 || adjFileIdx > 7) continue;
      const adjFile = files[adjFileIdx]!;
      const pawnSq = adjFile + pawnRank;
      if (pawnSquares.includes(pawnSq)) return true;
    }

    return false;
  }

  /**
   * Check if enemy pawns can ever attack a square
   */
  private canEnemyPawnsAttack(
    square: string,
    oppPawnSquares: string[],
    oppSide: 'w' | 'b',
  ): boolean {
    const files = 'abcdefgh';
    const file = square[0]!;
    const rank = parseInt(square[1]!);
    const fileIdx = files.indexOf(file);

    // Get adjacent files
    const adjFiles: string[] = [];
    if (fileIdx > 0) adjFiles.push(files[fileIdx - 1]!);
    if (fileIdx < 7) adjFiles.push(files[fileIdx + 1]!);

    // Check if any pawn on adjacent files could reach and attack
    for (const adjFile of adjFiles) {
      for (const pawnSq of oppPawnSquares) {
        if (pawnSq[0] !== adjFile) continue;
        const pawnRank = parseInt(pawnSq[1]!);

        // Opponent pawn must be behind to potentially attack
        if (oppSide === 'w') {
          // White pawns move up, so pawn must be below to attack
          if (pawnRank < rank) return true;
        } else {
          // Black pawns move down
          if (pawnRank > rank) return true;
        }
      }
    }

    return false;
  }

  /**
   * Find weak squares and weak complexes
   */
  private findWeakSquares(position: DetectorPosition): PositionalFeature[] {
    const features: PositionalFeature[] = [];
    const files = 'abcdefgh';

    for (const side of ['w', 'b'] as const) {
      const pieceMap = side === 'w' ? position.pieces.white : position.pieces.black;
      const pawnSquares = pieceMap.get('p') ?? [];

      // Find squares that can't be defended by pawns
      const weakLightSquares: string[] = [];
      const weakDarkSquares: string[] = [];

      // Check central and important squares
      const importantRanks = side === 'w' ? [3, 4, 5, 6] : [3, 4, 5, 6];

      for (const rank of importantRanks) {
        for (let fileIdx = 2; fileIdx < 6; fileIdx++) {
          // c-f files
          const file = files[fileIdx]!;
          const square = file + rank;

          // Check if friendly pawns can defend this square
          if (!this.canPawnsDefend(square, pawnSquares, side)) {
            const isLightSquare = this.isLightSquare(square);
            if (isLightSquare) {
              weakLightSquares.push(square);
            } else {
              weakDarkSquares.push(square);
            }
          }
        }
      }

      // Report weak complexes (3+ weak squares of same color)
      const opponent = side === 'w' ? 'b' : 'w';

      if (weakLightSquares.length >= 3) {
        features.push({
          type: 'weak_complex',
          beneficiary: opponent,
          squares: weakLightSquares,
        });
      } else if (weakLightSquares.length >= 1) {
        for (const sq of weakLightSquares) {
          features.push({
            type: 'weak_square',
            beneficiary: opponent,
            squares: [sq],
          });
        }
      }

      if (weakDarkSquares.length >= 3) {
        features.push({
          type: 'weak_complex',
          beneficiary: opponent,
          squares: weakDarkSquares,
        });
      } else if (weakDarkSquares.length >= 1) {
        for (const sq of weakDarkSquares) {
          features.push({
            type: 'weak_square',
            beneficiary: opponent,
            squares: [sq],
          });
        }
      }
    }

    return features;
  }

  /**
   * Check if pawns can defend a square
   */
  private canPawnsDefend(square: string, pawnSquares: string[], side: 'w' | 'b'): boolean {
    const files = 'abcdefgh';
    const file = square[0]!;
    const rank = parseInt(square[1]!);
    const fileIdx = files.indexOf(file);

    // Check adjacent files for pawns that could defend
    for (const offset of [-1, 1]) {
      const adjFileIdx = fileIdx + offset;
      if (adjFileIdx < 0 || adjFileIdx > 7) continue;
      const adjFile = files[adjFileIdx]!;

      for (const pawnSq of pawnSquares) {
        if (pawnSq[0] !== adjFile) continue;
        const pawnRank = parseInt(pawnSq[1]!);

        // Check if this pawn can (eventually) control the square
        if (side === 'w') {
          // White pawns move up
          if (pawnRank < rank) return true;
        } else {
          // Black pawns move down
          if (pawnRank > rank) return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a square is a light square
   */
  private isLightSquare(square: string): boolean {
    const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = parseInt(square[1]!) - 1;
    return (file + rank) % 2 === 1;
  }

  /**
   * Find bishop pair advantage
   */
  private findBishopPair(position: DetectorPosition): PositionalFeature[] {
    const features: PositionalFeature[] = [];

    for (const side of ['w', 'b'] as const) {
      const pieceMap = side === 'w' ? position.pieces.white : position.pieces.black;
      const bishops = pieceMap.get('b') ?? [];

      if (bishops.length >= 2) {
        // Check if bishops are on different colored squares
        let hasLightBishop = false;
        let hasDarkBishop = false;

        for (const sq of bishops) {
          if (this.isLightSquare(sq)) {
            hasLightBishop = true;
          } else {
            hasDarkBishop = true;
          }
        }

        if (hasLightBishop && hasDarkBishop) {
          // Check if opponent has bishop pair too
          const oppPieceMap = side === 'w' ? position.pieces.black : position.pieces.white;
          const oppBishops = oppPieceMap.get('b') ?? [];

          let oppHasLightBishop = false;
          let oppHasDarkBishop = false;
          for (const sq of oppBishops) {
            if (this.isLightSquare(sq)) {
              oppHasLightBishop = true;
            } else {
              oppHasDarkBishop = true;
            }
          }

          // Only report if opponent doesn't have bishop pair
          if (!(oppHasLightBishop && oppHasDarkBishop)) {
            features.push({
              type: 'bishop_pair',
              beneficiary: side,
              squares: bishops,
              pieces: bishops.map((sq) => ({
                square: sq,
                piece: side === 'w' ? 'B' : 'b',
              })),
            });
          }
        }
      }
    }

    return features;
  }

  /**
   * Find bad bishops (blocked by own pawns)
   */
  private findBadBishops(position: DetectorPosition): PositionalFeature[] {
    const features: PositionalFeature[] = [];

    for (const side of ['w', 'b'] as const) {
      const pieceMap = side === 'w' ? position.pieces.white : position.pieces.black;
      const bishops = pieceMap.get('b') ?? [];
      const pawnSquares = pieceMap.get('p') ?? [];

      for (const bishopSq of bishops) {
        const isLight = this.isLightSquare(bishopSq);

        // Count pawns on same colored squares
        let pawnsOnSameColor = 0;
        const centerPawns = ['d', 'e'];

        for (const pawnSq of pawnSquares) {
          if (this.isLightSquare(pawnSq) === isLight) {
            pawnsOnSameColor++;
            // Central pawns make it worse
            if (centerPawns.includes(pawnSq[0]!)) {
              pawnsOnSameColor++;
            }
          }
        }

        // Bad bishop if 4+ pawns on same color, or 3+ with center pawns
        if (pawnsOnSameColor >= 4) {
          const opponent = side === 'w' ? 'b' : 'w';
          features.push({
            type: 'bad_bishop',
            beneficiary: opponent,
            squares: [bishopSq],
            pieces: [{ square: bishopSq, piece: side === 'w' ? 'B' : 'b' }],
          });
        }
      }
    }

    return features;
  }

  /**
   * Find space advantage
   */
  private findSpaceAdvantage(position: DetectorPosition): PositionalFeature[] {
    const features: PositionalFeature[] = [];

    // Count pawns advanced past the 4th rank
    const whitePawns = position.pieces.white.get('p') ?? [];
    const blackPawns = position.pieces.black.get('p') ?? [];

    let whiteSpace = 0;
    let blackSpace = 0;

    for (const sq of whitePawns) {
      const rank = parseInt(sq[1]!);
      if (rank >= 5) whiteSpace += rank - 4;
    }

    for (const sq of blackPawns) {
      const rank = parseInt(sq[1]!);
      if (rank <= 4) blackSpace += 5 - rank;
    }

    const spaceDiff = whiteSpace - blackSpace;

    if (Math.abs(spaceDiff) >= 3) {
      const beneficiary = spaceDiff > 0 ? 'w' : 'b';
      const pawns = spaceDiff > 0 ? whitePawns : blackPawns;
      features.push({
        type: 'space_advantage',
        beneficiary,
        squares: pawns.filter((sq) => {
          const rank = parseInt(sq[1]!);
          return beneficiary === 'w' ? rank >= 5 : rank <= 4;
        }),
        magnitude: Math.abs(spaceDiff),
      });
    }

    return features;
  }

  /**
   * Convert feature to theme instance
   */
  private featureToTheme(
    feature: PositionalFeature,
    ply: number,
  ): ReturnType<typeof createThemeInstance> {
    const severity = this.calculateFeatureSeverity(feature);
    const confidence = 0.85;

    const pieces: ThemePieceInfo[] =
      feature.pieces?.map((p) => ({
        type: p.piece.toLowerCase(),
        square: p.square,
        color: feature.beneficiary,
      })) ?? [];

    const explanation = this.getExplanation(feature);
    const detailedExplanation = this.getDetailedExplanation(feature);

    return createThemeInstance(
      feature.type,
      'positional',
      feature.beneficiary,
      feature.squares[0]!,
      severity,
      confidence,
      explanation,
      ply,
      {
        secondarySquares: feature.squares.slice(1),
        pieces,
        detailedExplanation,
      },
    );
  }

  /**
   * Calculate feature severity
   */
  private calculateFeatureSeverity(feature: PositionalFeature): ThemeSeverity {
    switch (feature.type) {
      case 'outpost':
        return feature.pieces?.length ? 'significant' : 'moderate';
      case 'weak_square':
        return 'moderate';
      case 'weak_complex':
        return 'significant';
      case 'bishop_pair':
        return 'moderate';
      case 'bad_bishop':
        return 'moderate';
      case 'space_advantage':
        return (feature.magnitude ?? 0) >= 5 ? 'significant' : 'moderate';
      case 'piece_activity':
        return 'moderate';
      default:
        return 'minor';
    }
  }

  /**
   * Get short explanation
   */
  private getExplanation(feature: PositionalFeature): string {
    const side = feature.beneficiary === 'w' ? 'White' : 'Black';
    switch (feature.type) {
      case 'outpost':
        return feature.pieces?.length
          ? `${side} has piece on outpost ${feature.squares[0]}`
          : `${side} has outpost on ${feature.squares[0]}`;
      case 'weak_square':
        return `${side} benefits from weak square on ${feature.squares[0]}`;
      case 'weak_complex':
        return `${side} benefits from weak square complex`;
      case 'bishop_pair':
        return `${side} has the bishop pair`;
      case 'bad_bishop':
        return `${side} benefits from opponent's bad bishop on ${feature.squares[0]}`;
      case 'space_advantage':
        return `${side} has space advantage`;
      case 'piece_activity':
        return `${side} has better piece activity`;
    }
  }

  /**
   * Get detailed explanation
   */
  private getDetailedExplanation(feature: PositionalFeature): string {
    const side = feature.beneficiary === 'w' ? 'White' : 'Black';
    switch (feature.type) {
      case 'outpost':
        return feature.pieces?.length
          ? `${side}'s ${this.pieceName(feature.pieces[0]!.piece)} on ${feature.squares[0]} occupies a strong outpost that cannot be attacked by enemy pawns.`
          : `The square ${feature.squares[0]} is an outpost for ${side} - it's defended by a pawn and cannot be attacked by enemy pawns.`;
      case 'weak_square':
        return `The square ${feature.squares[0]} cannot be defended by the opponent's pawns, creating a potential target for ${side}.`;
      case 'weak_complex':
        return `${side} benefits from a complex of weak squares (${feature.squares.join(', ')}) that cannot be defended by enemy pawns.`;
      case 'bishop_pair':
        return `${side} has both bishops while the opponent does not. The bishop pair is particularly strong in open positions.`;
      case 'bad_bishop':
        return `The bishop on ${feature.squares[0]} is restricted by its own pawns on the same colored squares.`;
      case 'space_advantage':
        return `${side} has advanced pawns controlling more space, restricting the opponent's piece mobility.`;
      case 'piece_activity':
        return `${side}'s pieces are more actively placed with better mobility and coordination.`;
    }
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
            changeDescription: `${theme.type} emerged`,
          }),
        );
      }
    }

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
}

/**
 * Create a positional detector instance
 */
export function createPositionalDetector(): PositionalDetector {
  return new PositionalDetector();
}
