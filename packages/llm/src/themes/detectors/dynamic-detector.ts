/**
 * Dynamic Theme Detector
 *
 * Detects dynamic features including:
 * - King safety (exposed king, weak shelter)
 * - King in center (uncastled king in middlegame)
 * - Open files (rooks on open files)
 * - Half-open files (rooks on half-open files)
 * - Development lead
 * - Initiative (attacking potential)
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
 * Dynamic feature info
 */
interface DynamicFeature {
  type:
    | 'king_in_center'
    | 'king_safety'
    | 'open_file'
    | 'half_open_file'
    | 'development_lead'
    | 'initiative';
  beneficiary: 'w' | 'b';
  squares: string[];
  pieces?: { square: string; piece: string }[];
  magnitude?: number;
}

/**
 * Detects dynamic features
 */
export class DynamicDetector extends BaseThemeDetector {
  readonly id = 'dynamic-detector';
  readonly name = 'Dynamic Detector';
  readonly themeTypes: ThemeType[] = [
    'king_in_center',
    'king_safety',
    'open_file',
    'half_open_file',
    'development_lead',
    'initiative',
  ];
  readonly category = 'dynamic';
  readonly minimumTier = 'shallow';
  readonly priority = 75;

  detect(context: DetectorContext): DetectorResult {
    const startTime = Date.now();
    const { position, ply, previousThemes } = context;

    const features = this.findAllDynamicFeatures(position, ply);
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
   * Find all dynamic features
   */
  private findAllDynamicFeatures(position: DetectorPosition, ply: number): DynamicFeature[] {
    const features: DynamicFeature[] = [];

    // Only check king-in-center in early middlegame
    if (ply < 40) {
      features.push(...this.findKingInCenter(position, ply));
    }

    // Find open/half-open files
    features.push(...this.findOpenFiles(position));

    // Check development lead (first 20 moves)
    if (ply < 40) {
      features.push(...this.findDevelopmentLead(position));
    }

    // Check king safety
    features.push(...this.findKingSafety(position));

    return features;
  }

  /**
   * Find king in center issues
   */
  private findKingInCenter(position: DetectorPosition, ply: number): DynamicFeature[] {
    const features: DynamicFeature[] = [];

    // Check both kings
    for (const side of ['w', 'b'] as const) {
      const kingSquare = side === 'w' ? position.whiteKingSquare : position.blackKingSquare;
      const file = kingSquare[0]!;
      const rank = parseInt(kingSquare[1]!);

      // King is in center if on d-e files and hasn't moved to back rank corners
      const isCenterFile = file === 'd' || file === 'e';
      const isBackRank = side === 'w' ? rank === 1 : rank === 8;

      // In middlegame, uncastled king is a problem
      if (isCenterFile && isBackRank && ply >= 12) {
        const opponent = side === 'w' ? 'b' : 'w';
        features.push({
          type: 'king_in_center',
          beneficiary: opponent,
          squares: [kingSquare],
          pieces: [{ square: kingSquare, piece: side === 'w' ? 'K' : 'k' }],
        });
      }
    }

    return features;
  }

  /**
   * Find open and half-open files
   */
  private findOpenFiles(position: DetectorPosition): DynamicFeature[] {
    const features: DynamicFeature[] = [];
    const files = 'abcdefgh';

    const whitePawns = position.pieces.white.get('p') ?? [];
    const blackPawns = position.pieces.black.get('p') ?? [];
    const whiteRooks = position.pieces.white.get('r') ?? [];
    const blackRooks = position.pieces.black.get('r') ?? [];

    const whitePawnFiles = new Set(whitePawns.map((sq) => sq[0]!));
    const blackPawnFiles = new Set(blackPawns.map((sq) => sq[0]!));

    for (let i = 0; i < 8; i++) {
      const file = files[i]!;
      const hasWhitePawn = whitePawnFiles.has(file);
      const hasBlackPawn = blackPawnFiles.has(file);

      if (!hasWhitePawn && !hasBlackPawn) {
        // Open file - check for rooks
        const whiteRooksOnFile = whiteRooks.filter((sq) => sq[0] === file);
        const blackRooksOnFile = blackRooks.filter((sq) => sq[0] === file);

        if (whiteRooksOnFile.length > 0) {
          features.push({
            type: 'open_file',
            beneficiary: 'w',
            squares: whiteRooksOnFile,
            pieces: whiteRooksOnFile.map((sq) => ({ square: sq, piece: 'R' })),
          });
        }
        if (blackRooksOnFile.length > 0) {
          features.push({
            type: 'open_file',
            beneficiary: 'b',
            squares: blackRooksOnFile,
            pieces: blackRooksOnFile.map((sq) => ({ square: sq, piece: 'r' })),
          });
        }
      } else if (!hasWhitePawn || !hasBlackPawn) {
        // Half-open file
        if (!hasWhitePawn) {
          const blackRooksOnFile = blackRooks.filter((sq) => sq[0] === file);
          if (blackRooksOnFile.length > 0) {
            features.push({
              type: 'half_open_file',
              beneficiary: 'b',
              squares: blackRooksOnFile,
              pieces: blackRooksOnFile.map((sq) => ({ square: sq, piece: 'r' })),
            });
          }
        }
        if (!hasBlackPawn) {
          const whiteRooksOnFile = whiteRooks.filter((sq) => sq[0] === file);
          if (whiteRooksOnFile.length > 0) {
            features.push({
              type: 'half_open_file',
              beneficiary: 'w',
              squares: whiteRooksOnFile,
              pieces: whiteRooksOnFile.map((sq) => ({ square: sq, piece: 'R' })),
            });
          }
        }
      }
    }

    return features;
  }

  /**
   * Find development lead
   */
  private findDevelopmentLead(position: DetectorPosition): DynamicFeature[] {
    const features: DynamicFeature[] = [];

    // Count developed pieces (not on back rank)
    const whiteDeveloped = this.countDevelopedPieces(position, 'w');
    const blackDeveloped = this.countDevelopedPieces(position, 'b');

    const developmentDiff = whiteDeveloped - blackDeveloped;

    if (Math.abs(developmentDiff) >= 2) {
      const beneficiary = developmentDiff > 0 ? 'w' : 'b';
      features.push({
        type: 'development_lead',
        beneficiary,
        squares: [],
        magnitude: Math.abs(developmentDiff),
      });
    }

    return features;
  }

  /**
   * Count developed pieces for a side
   */
  private countDevelopedPieces(position: DetectorPosition, side: 'w' | 'b'): number {
    const pieceMap = side === 'w' ? position.pieces.white : position.pieces.black;
    const backRank = side === 'w' ? '1' : '8';
    let developed = 0;

    // Count developed minor pieces
    for (const pieceType of ['n', 'b']) {
      const squares = pieceMap.get(pieceType) ?? [];
      for (const sq of squares) {
        if (sq[1] !== backRank) developed++;
      }
    }

    // Count developed rooks (not on starting squares)
    const startingRooks = side === 'w' ? ['a1', 'h1'] : ['a8', 'h8'];
    const rooks = pieceMap.get('r') ?? [];
    for (const sq of rooks) {
      if (!startingRooks.includes(sq)) developed++;
    }

    // Count castled king as developed
    const kingSquare = side === 'w' ? position.whiteKingSquare : position.blackKingSquare;
    const castledSquares = side === 'w' ? ['g1', 'c1', 'b1', 'h1'] : ['g8', 'c8', 'b8', 'h8'];
    if (castledSquares.includes(kingSquare)) developed++;

    return developed;
  }

  /**
   * Find king safety issues
   */
  private findKingSafety(position: DetectorPosition): DynamicFeature[] {
    const features: DynamicFeature[] = [];

    for (const side of ['w', 'b'] as const) {
      const kingSquare = side === 'w' ? position.whiteKingSquare : position.blackKingSquare;
      const file = kingSquare[0]!;
      const rank = parseInt(kingSquare[1]!);
      const files = 'abcdefgh';
      const fileIdx = files.indexOf(file);

      // Check pawn shield
      const pieceMap = side === 'w' ? position.pieces.white : position.pieces.black;
      const pawnSquares = pieceMap.get('p') ?? [];
      const shieldRank = side === 'w' ? rank + 1 : rank - 1;

      if (shieldRank < 1 || shieldRank > 8) continue;

      // Count pawns in front of king
      let shieldPawns = 0;
      for (const offset of [-1, 0, 1]) {
        const shieldFileIdx = fileIdx + offset;
        if (shieldFileIdx < 0 || shieldFileIdx > 7) continue;
        const shieldFile = files[shieldFileIdx]!;
        const shieldSq = shieldFile + shieldRank;
        if (pawnSquares.includes(shieldSq)) shieldPawns++;
      }

      // Weak king safety if 0-1 pawns shielding and king is castled
      const isCastledSide = side === 'w' ? rank === 1 : rank === 8;
      const isCornerFile = file === 'a' || file === 'b' || file === 'g' || file === 'h';

      if (isCastledSide && isCornerFile && shieldPawns < 2) {
        const opponent = side === 'w' ? 'b' : 'w';
        features.push({
          type: 'king_safety',
          beneficiary: opponent,
          squares: [kingSquare],
          pieces: [{ square: kingSquare, piece: side === 'w' ? 'K' : 'k' }],
          magnitude: 2 - shieldPawns,
        });
      }
    }

    return features;
  }

  /**
   * Convert feature to theme instance
   */
  private featureToTheme(
    feature: DynamicFeature,
    ply: number,
  ): ReturnType<typeof createThemeInstance> {
    const severity = this.calculateFeatureSeverity(feature);
    const confidence = 0.8;

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
      'dynamic',
      feature.beneficiary,
      feature.squares[0] ?? 'e4',
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
  private calculateFeatureSeverity(feature: DynamicFeature): ThemeSeverity {
    switch (feature.type) {
      case 'king_in_center':
        return 'significant';
      case 'king_safety':
        return (feature.magnitude ?? 0) >= 2 ? 'significant' : 'moderate';
      case 'open_file':
        return 'moderate';
      case 'half_open_file':
        return 'minor';
      case 'development_lead':
        return (feature.magnitude ?? 0) >= 3 ? 'significant' : 'moderate';
      case 'initiative':
        return 'moderate';
      default:
        return 'minor';
    }
  }

  /**
   * Get short explanation
   */
  private getExplanation(feature: DynamicFeature): string {
    const side = feature.beneficiary === 'w' ? 'White' : 'Black';
    const opponent = feature.beneficiary === 'w' ? 'Black' : 'White';
    switch (feature.type) {
      case 'king_in_center':
        return `${opponent}'s king stuck in center`;
      case 'king_safety':
        return `${opponent}'s king is exposed`;
      case 'open_file':
        return `${side} controls open ${feature.squares[0]?.[0]}-file`;
      case 'half_open_file':
        return `${side} has rook on half-open ${feature.squares[0]?.[0]}-file`;
      case 'development_lead':
        return `${side} has development advantage`;
      case 'initiative':
        return `${side} has the initiative`;
    }
  }

  /**
   * Get detailed explanation
   */
  private getDetailedExplanation(feature: DynamicFeature): string {
    const side = feature.beneficiary === 'w' ? 'White' : 'Black';
    const opponent = feature.beneficiary === 'w' ? 'Black' : 'White';
    switch (feature.type) {
      case 'king_in_center':
        return `${opponent}'s king remains on its starting square while pieces are developed. This can become dangerous as the center may open up.`;
      case 'king_safety':
        return `${opponent}'s king lacks adequate pawn protection, creating attacking opportunities for ${side}.`;
      case 'open_file':
        return `${side}'s rook on ${feature.squares[0]} controls an open file (no pawns), providing potential invasion routes.`;
      case 'half_open_file':
        return `${side}'s rook on ${feature.squares[0]} is on a half-open file, potentially targeting the opponent's pawn.`;
      case 'development_lead':
        return `${side} has developed ${feature.magnitude} more pieces than ${opponent}, providing better coordination and attacking potential.`;
      case 'initiative':
        return `${side} has the initiative with more active pieces and threats that force the opponent to react.`;
    }
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
 * Create a dynamic detector instance
 */
export function createDynamicDetector(): DynamicDetector {
  return new DynamicDetector();
}
