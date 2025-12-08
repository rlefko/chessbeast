/**
 * Pawn Structure Detector
 *
 * Detects pawn structure features including:
 * - Isolated pawns (no friendly pawns on adjacent files)
 * - Doubled pawns (multiple pawns on same file)
 * - Backward pawns (cannot be protected by adjacent pawns)
 * - Passed pawns (no opposing pawns blocking or attacking advance path)
 * - Connected passers (passed pawns that can support each other)
 * - Pawn chains (diagonal pawn structures)
 * - Pawn majorities (more pawns on a wing)
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
 * Pawn structure feature info
 */
interface PawnFeature {
  type:
    | 'isolated_pawn'
    | 'doubled_pawns'
    | 'backward_pawn'
    | 'passed_pawn'
    | 'connected_passers'
    | 'pawn_chain'
    | 'pawn_majority';
  side: 'w' | 'b';
  squares: string[];
  wing?: 'queenside' | 'kingside';
  majorityCount?: number;
}

/**
 * Detects pawn structure features
 */
export class PawnStructureDetector extends BaseThemeDetector {
  readonly id = 'pawn-structure-detector';
  readonly name = 'Pawn Structure Detector';
  readonly themeTypes: ThemeType[] = [
    'isolated_pawn',
    'doubled_pawns',
    'backward_pawn',
    'passed_pawn',
    'connected_passers',
    'pawn_chain',
    'pawn_majority',
  ];
  readonly category = 'structural';
  readonly minimumTier = 'shallow';
  readonly priority = 70;

  detect(context: DetectorContext): DetectorResult {
    const startTime = Date.now();
    const { position, ply, previousThemes } = context;

    const features = this.findAllPawnFeatures(position);
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
   * Find all pawn structure features for both sides
   */
  private findAllPawnFeatures(position: DetectorPosition): PawnFeature[] {
    const features: PawnFeature[] = [];

    for (const side of ['w', 'b'] as const) {
      // Get pawn locations
      const pieceMap = side === 'w' ? position.pieces.white : position.pieces.black;
      const pawnSquares = pieceMap.get('p') ?? [];
      const oppPieceMap = side === 'w' ? position.pieces.black : position.pieces.white;
      const oppPawnSquares = oppPieceMap.get('p') ?? [];

      // Analyze each pawn
      const pawnsByFile = this.groupPawnsByFile(pawnSquares);
      const oppPawnsByFile = this.groupPawnsByFile(oppPawnSquares);

      // Check isolated pawns
      features.push(...this.findIsolatedPawns(pawnsByFile, side));

      // Check doubled pawns
      features.push(...this.findDoubledPawns(pawnsByFile, side));

      // Check backward pawns
      features.push(...this.findBackwardPawns(pawnSquares, pawnsByFile, oppPawnsByFile, side));

      // Check passed pawns
      const passedPawns = this.findPassedPawns(pawnSquares, oppPawnsByFile, side);
      features.push(...passedPawns);

      // Check connected passers
      if (passedPawns.length >= 2) {
        features.push(
          ...this.findConnectedPassers(
            passedPawns.flatMap((p) => p.squares),
            side,
          ),
        );
      }

      // Check pawn chains
      features.push(...this.findPawnChains(pawnSquares, side));

      // Check pawn majorities
      features.push(...this.findPawnMajorities(pawnsByFile, oppPawnsByFile, side));
    }

    return features;
  }

  /**
   * Group pawns by file
   */
  private groupPawnsByFile(pawnSquares: string[]): Map<string, string[]> {
    const byFile = new Map<string, string[]>();
    for (const sq of pawnSquares) {
      const file = sq[0]!;
      const existing = byFile.get(file) ?? [];
      existing.push(sq);
      byFile.set(file, existing);
    }
    return byFile;
  }

  /**
   * Find isolated pawns
   */
  private findIsolatedPawns(pawnsByFile: Map<string, string[]>, side: 'w' | 'b'): PawnFeature[] {
    const features: PawnFeature[] = [];
    const files = 'abcdefgh';

    for (const [file, squares] of pawnsByFile) {
      const fileIdx = files.indexOf(file);
      const adjFiles = [];
      if (fileIdx > 0) adjFiles.push(files[fileIdx - 1]!);
      if (fileIdx < 7) adjFiles.push(files[fileIdx + 1]!);

      const hasAdjPawns = adjFiles.some((f) => (pawnsByFile.get(f)?.length ?? 0) > 0);
      if (!hasAdjPawns) {
        for (const sq of squares) {
          features.push({
            type: 'isolated_pawn',
            side,
            squares: [sq],
          });
        }
      }
    }

    return features;
  }

  /**
   * Find doubled pawns
   */
  private findDoubledPawns(pawnsByFile: Map<string, string[]>, side: 'w' | 'b'): PawnFeature[] {
    const features: PawnFeature[] = [];

    for (const [_file, squares] of pawnsByFile) {
      if (squares.length >= 2) {
        features.push({
          type: 'doubled_pawns',
          side,
          squares: [...squares],
        });
      }
    }

    return features;
  }

  /**
   * Find backward pawns
   */
  private findBackwardPawns(
    pawnSquares: string[],
    pawnsByFile: Map<string, string[]>,
    oppPawnsByFile: Map<string, string[]>,
    side: 'w' | 'b',
  ): PawnFeature[] {
    const features: PawnFeature[] = [];
    const files = 'abcdefgh';
    const direction = side === 'w' ? 1 : -1;

    for (const sq of pawnSquares) {
      const file = sq[0]!;
      const rank = parseInt(sq[1]!);
      const fileIdx = files.indexOf(file);

      // Get adjacent files
      const adjFiles: string[] = [];
      if (fileIdx > 0) adjFiles.push(files[fileIdx - 1]!);
      if (fileIdx < 7) adjFiles.push(files[fileIdx + 1]!);

      // Check if this pawn is behind its neighbors
      let isBehind = false;
      for (const adjFile of adjFiles) {
        const adjPawns = pawnsByFile.get(adjFile) ?? [];
        for (const adjSq of adjPawns) {
          const adjRank = parseInt(adjSq[1]!);
          if (side === 'w' ? adjRank > rank : adjRank < rank) {
            isBehind = true;
            break;
          }
        }
        if (isBehind) break;
      }

      if (!isBehind) continue;

      // Check if the advance square is controlled by opponent pawns
      const advanceRank = rank + direction;
      if (advanceRank < 1 || advanceRank > 8) continue;

      let isBlocked = false;

      // Check if opponent pawns can attack the advance square
      for (const adjFile of adjFiles) {
        const oppPawns = oppPawnsByFile.get(adjFile) ?? [];
        for (const oppSq of oppPawns) {
          const oppRank = parseInt(oppSq[1]!);
          const attackRank = side === 'w' ? oppRank - 1 : oppRank + 1;
          if (attackRank === advanceRank) {
            isBlocked = true;
            break;
          }
        }
        if (isBlocked) break;
      }

      // It's backward if it's behind neighbors and can't safely advance
      if (isBehind) {
        features.push({
          type: 'backward_pawn',
          side,
          squares: [sq],
        });
      }
    }

    return features;
  }

  /**
   * Find passed pawns
   */
  private findPassedPawns(
    pawnSquares: string[],
    oppPawnsByFile: Map<string, string[]>,
    side: 'w' | 'b',
  ): PawnFeature[] {
    const features: PawnFeature[] = [];
    const files = 'abcdefgh';

    for (const sq of pawnSquares) {
      const file = sq[0]!;
      const rank = parseInt(sq[1]!);
      const fileIdx = files.indexOf(file);

      // Get files to check (current and adjacent)
      const checkFiles = [file];
      if (fileIdx > 0) checkFiles.push(files[fileIdx - 1]!);
      if (fileIdx < 7) checkFiles.push(files[fileIdx + 1]!);

      // Check if any opponent pawn can block or attack
      let isPassed = true;
      for (const checkFile of checkFiles) {
        const oppPawns = oppPawnsByFile.get(checkFile) ?? [];
        for (const oppSq of oppPawns) {
          const oppRank = parseInt(oppSq[1]!);
          // Opponent pawn must be ahead of this pawn to block
          if (side === 'w' ? oppRank > rank : oppRank < rank) {
            isPassed = false;
            break;
          }
        }
        if (!isPassed) break;
      }

      if (isPassed) {
        features.push({
          type: 'passed_pawn',
          side,
          squares: [sq],
        });
      }
    }

    return features;
  }

  /**
   * Find connected passed pawns
   */
  private findConnectedPassers(passedSquares: string[], side: 'w' | 'b'): PawnFeature[] {
    const features: PawnFeature[] = [];
    const files = 'abcdefgh';

    // Sort by file
    const sorted = [...passedSquares].sort((a, b) => files.indexOf(a[0]!) - files.indexOf(b[0]!));

    // Find groups of connected pawns
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i]!;
      const next = sorted[i + 1]!;
      const currFileIdx = files.indexOf(curr[0]!);
      const nextFileIdx = files.indexOf(next[0]!);

      // Connected if on adjacent files
      if (nextFileIdx - currFileIdx === 1) {
        features.push({
          type: 'connected_passers',
          side,
          squares: [curr, next],
        });
      }
    }

    return features;
  }

  /**
   * Find pawn chains
   */
  private findPawnChains(pawnSquares: string[], side: 'w' | 'b'): PawnFeature[] {
    const features: PawnFeature[] = [];
    const files = 'abcdefgh';
    const direction = side === 'w' ? 1 : -1;
    const pawnSet = new Set(pawnSquares);

    // Find chains by looking for diagonal connections
    const usedInChain = new Set<string>();

    for (const sq of pawnSquares) {
      if (usedInChain.has(sq)) continue;

      const chain: string[] = [sq];
      let current = sq;

      // Extend chain forward (in pawn's direction)
      let found = true;
      while (found) {
        found = false;
        const file = current[0]!;
        const rank = parseInt(current[1]!);
        const fileIdx = files.indexOf(file);

        // Check diagonal squares for pawns that support this one
        for (const offset of [-1, 1]) {
          const adjFileIdx = fileIdx + offset;
          if (adjFileIdx < 0 || adjFileIdx > 7) continue;

          const adjFile = files[adjFileIdx]!;
          const supportRank = rank + direction;
          if (supportRank < 1 || supportRank > 8) continue;

          const supportSq = adjFile + supportRank;
          if (pawnSet.has(supportSq) && !usedInChain.has(supportSq)) {
            chain.push(supportSq);
            usedInChain.add(supportSq);
            current = supportSq;
            found = true;
            break;
          }
        }
      }

      // Only count as chain if 3+ pawns
      if (chain.length >= 3) {
        usedInChain.add(sq);
        for (const chainSq of chain) {
          usedInChain.add(chainSq);
        }
        features.push({
          type: 'pawn_chain',
          side,
          squares: chain,
        });
      }
    }

    return features;
  }

  /**
   * Find pawn majorities
   */
  private findPawnMajorities(
    pawnsByFile: Map<string, string[]>,
    oppPawnsByFile: Map<string, string[]>,
    side: 'w' | 'b',
  ): PawnFeature[] {
    const features: PawnFeature[] = [];
    const queensideFiles = ['a', 'b', 'c', 'd'];
    const kingsideFiles = ['e', 'f', 'g', 'h'];

    const countPawns = (byFile: Map<string, string[]>, fileList: string[]): number => {
      let count = 0;
      for (const f of fileList) {
        count += byFile.get(f)?.length ?? 0;
      }
      return count;
    };

    const qsPawns = countPawns(pawnsByFile, queensideFiles);
    const qsOppPawns = countPawns(oppPawnsByFile, queensideFiles);
    const ksPawns = countPawns(pawnsByFile, kingsideFiles);
    const ksOppPawns = countPawns(oppPawnsByFile, kingsideFiles);

    if (qsPawns > qsOppPawns) {
      const squares: string[] = [];
      for (const f of queensideFiles) {
        squares.push(...(pawnsByFile.get(f) ?? []));
      }
      features.push({
        type: 'pawn_majority',
        side,
        squares,
        wing: 'queenside',
        majorityCount: qsPawns - qsOppPawns,
      });
    }

    if (ksPawns > ksOppPawns) {
      const squares: string[] = [];
      for (const f of kingsideFiles) {
        squares.push(...(pawnsByFile.get(f) ?? []));
      }
      features.push({
        type: 'pawn_majority',
        side,
        squares,
        wing: 'kingside',
        majorityCount: ksPawns - ksOppPawns,
      });
    }

    return features;
  }

  /**
   * Convert feature to theme instance
   */
  private featureToTheme(
    feature: PawnFeature,
    ply: number,
  ): ReturnType<typeof createThemeInstance> {
    const severity = this.calculateFeatureSeverity(feature);
    const confidence = 0.9;
    const beneficiary = this.getBeneficiary(feature);

    const pieces: ThemePieceInfo[] = feature.squares.map((sq) => ({
      type: 'p',
      square: sq,
      color: feature.side,
    }));

    const explanation = this.getExplanation(feature);
    const detailedExplanation = this.getDetailedExplanation(feature);

    return createThemeInstance(
      feature.type,
      'structural',
      beneficiary,
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
   * Get the side that benefits from this feature
   */
  private getBeneficiary(feature: PawnFeature): 'w' | 'b' {
    // Weaknesses benefit opponent, strengths benefit owner
    switch (feature.type) {
      case 'isolated_pawn':
      case 'doubled_pawns':
      case 'backward_pawn':
        return feature.side === 'w' ? 'b' : 'w';
      case 'passed_pawn':
      case 'connected_passers':
      case 'pawn_chain':
      case 'pawn_majority':
        return feature.side;
    }
  }

  /**
   * Calculate feature severity
   */
  private calculateFeatureSeverity(feature: PawnFeature): ThemeSeverity {
    switch (feature.type) {
      case 'passed_pawn': {
        // Advanced passed pawns are more severe
        const rank = parseInt(feature.squares[0]![1]!);
        const advancedRank = feature.side === 'w' ? rank : 9 - rank;
        if (advancedRank >= 6) return 'critical';
        if (advancedRank >= 5) return 'significant';
        return 'moderate';
      }

      case 'connected_passers':
        return 'critical'; // Connected passers are very strong

      case 'isolated_pawn':
        return 'moderate';

      case 'doubled_pawns':
        return feature.squares.length >= 3 ? 'significant' : 'moderate';

      case 'backward_pawn':
        return 'moderate';

      case 'pawn_chain':
        return feature.squares.length >= 4 ? 'significant' : 'moderate';

      case 'pawn_majority':
        return (feature.majorityCount ?? 0) >= 2 ? 'significant' : 'moderate';

      default:
        return 'minor';
    }
  }

  /**
   * Get short explanation
   */
  private getExplanation(feature: PawnFeature): string {
    const side = feature.side === 'w' ? 'White' : 'Black';
    switch (feature.type) {
      case 'isolated_pawn':
        return `${side} has isolated pawn on ${feature.squares[0]}`;
      case 'doubled_pawns':
        return `${side} has doubled pawns on the ${feature.squares[0]![0]}-file`;
      case 'backward_pawn':
        return `${side} has backward pawn on ${feature.squares[0]}`;
      case 'passed_pawn':
        return `${side} has passed pawn on ${feature.squares[0]}`;
      case 'connected_passers':
        return `${side} has connected passed pawns`;
      case 'pawn_chain':
        return `${side} has pawn chain`;
      case 'pawn_majority':
        return `${side} has ${feature.wing} pawn majority`;
    }
  }

  /**
   * Get detailed explanation
   */
  private getDetailedExplanation(feature: PawnFeature): string {
    const side = feature.side === 'w' ? 'White' : 'Black';
    switch (feature.type) {
      case 'isolated_pawn':
        return `${side}'s pawn on ${feature.squares[0]} has no friendly pawns on adjacent files to support it. This makes it a potential target.`;
      case 'doubled_pawns':
        return `${side} has multiple pawns on the ${feature.squares[0]![0]}-file (${feature.squares.join(', ')}). Doubled pawns can't protect each other and may be weak.`;
      case 'backward_pawn':
        return `${side}'s pawn on ${feature.squares[0]} cannot safely advance because opposing pawns control its advance square.`;
      case 'passed_pawn':
        return `${side}'s pawn on ${feature.squares[0]} has no opposing pawns that can block or capture it on the way to promotion.`;
      case 'connected_passers':
        return `${side} has passed pawns on ${feature.squares.join(' and ')} that can support each other's advance.`;
      case 'pawn_chain':
        return `${side} has a pawn chain on ${feature.squares.join(', ')} providing mutual support.`;
      case 'pawn_majority':
        return `${side} has more pawns on the ${feature.wing} (${feature.majorityCount} pawn advantage).`;
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
 * Create a pawn structure detector instance
 */
export function createPawnStructureDetector(): PawnStructureDetector {
  return new PawnStructureDetector();
}
