/**
 * Idea Keys
 *
 * Generates stable, unique keys for chess ideas and concepts.
 * Used for redundancy detection in comment synthesis.
 */

import type { ThemeType, ThemeCategory } from '@chessbeast/core/storage';

import type { ThemeInstance } from './types.js';

/**
 * Idea key types
 */
export type IdeaKeyType =
  | 'theme' // Theme-based idea
  | 'tactic' // Tactical motif
  | 'plan' // Strategic plan
  | 'weakness' // Positional weakness
  | 'structure' // Pawn structure feature
  | 'piece_placement' // Piece on specific square
  | 'opening' // Opening concept
  | 'endgame'; // Endgame technique

/**
 * Idea key for redundancy tracking
 */
export interface IdeaKey {
  /** Full key string */
  key: string;

  /** Type of idea */
  type: IdeaKeyType;

  /** Main concept */
  concept: string;

  /** Specific instance (e.g., square, piece) */
  instance?: string;

  /** Beneficiary if applicable */
  beneficiary?: 'w' | 'b';
}

/**
 * Generate an idea key from a theme instance
 */
export function generateThemeIdeaKey(theme: ThemeInstance): IdeaKey {
  const instance = theme.primarySquare;
  const concept = theme.type;
  const beneficiary = theme.beneficiary;

  return {
    key: `theme:${concept}:${instance}:${beneficiary}`,
    type: 'theme',
    concept,
    instance,
    beneficiary,
  };
}

/**
 * Generate a tactical idea key
 */
export function generateTacticIdeaKey(
  tactic: string,
  targetSquare: string,
  beneficiary: 'w' | 'b',
): IdeaKey {
  return {
    key: `tactic:${tactic}:${targetSquare}:${beneficiary}`,
    type: 'tactic',
    concept: tactic,
    instance: targetSquare,
    beneficiary,
  };
}

/**
 * Generate a plan idea key
 */
export function generatePlanIdeaKey(
  planType: string,
  targetArea: string,
  beneficiary: 'w' | 'b',
): IdeaKey {
  return {
    key: `plan:${planType}:${targetArea}:${beneficiary}`,
    type: 'plan',
    concept: planType,
    instance: targetArea,
    beneficiary,
  };
}

/**
 * Generate a weakness idea key
 */
export function generateWeaknessIdeaKey(
  weaknessType: string,
  square: string,
  weakSide: 'w' | 'b',
): IdeaKey {
  return {
    key: `weakness:${weaknessType}:${square}:${weakSide}`,
    type: 'weakness',
    concept: weaknessType,
    instance: square,
    beneficiary: weakSide === 'w' ? 'b' : 'w', // Opponent benefits
  };
}

/**
 * Generate a structure idea key
 */
export function generateStructureIdeaKey(structureType: string, file?: string): IdeaKey {
  const instance = file ?? 'general';
  return {
    key: `structure:${structureType}:${instance}`,
    type: 'structure',
    concept: structureType,
    instance,
  };
}

/**
 * Generate a piece placement idea key
 */
export function generatePiecePlacementIdeaKey(
  piece: string,
  square: string,
  side: 'w' | 'b',
): IdeaKey {
  return {
    key: `piece:${piece}:${square}:${side}`,
    type: 'piece_placement',
    concept: `${piece}_placement`,
    instance: square,
    beneficiary: side,
  };
}

/**
 * Generate an opening idea key
 */
export function generateOpeningIdeaKey(openingName: string, variation?: string): IdeaKey {
  const concept = variation ? `${openingName}:${variation}` : openingName;

  return {
    key: `opening:${concept}`,
    type: 'opening',
    concept,
  };
}

/**
 * Generate an endgame idea key
 */
export function generateEndgameIdeaKey(endgameType: string, technique?: string): IdeaKey {
  const concept = technique ? `${endgameType}:${technique}` : endgameType;

  return {
    key: `endgame:${concept}`,
    type: 'endgame',
    concept,
  };
}

/**
 * Idea key set for tracking explained ideas
 */
export class IdeaKeySet {
  private keys: Set<string> = new Set();

  /**
   * Check if an idea has been explained
   */
  has(ideaKey: IdeaKey): boolean {
    return this.keys.has(ideaKey.key);
  }

  /**
   * Mark an idea as explained
   */
  add(ideaKey: IdeaKey): void {
    this.keys.add(ideaKey.key);
  }

  /**
   * Remove an idea from the set
   */
  delete(ideaKey: IdeaKey): boolean {
    return this.keys.delete(ideaKey.key);
  }

  /**
   * Mark multiple ideas as explained
   */
  addAll(ideaKeys: IdeaKey[]): void {
    for (const key of ideaKeys) {
      this.add(key);
    }
  }

  /**
   * Check if any ideas match a pattern
   */
  hasMatching(pattern: Partial<IdeaKey>): boolean {
    for (const key of this.keys) {
      const parts = key.split(':');
      const [type, concept, instance, beneficiary] = parts;

      if (pattern.type && type !== pattern.type) continue;
      if (pattern.concept && concept !== pattern.concept) continue;
      if (pattern.instance && instance !== pattern.instance) continue;
      if (pattern.beneficiary && beneficiary !== pattern.beneficiary) continue;

      return true;
    }
    return false;
  }

  /**
   * Get all explained ideas of a type
   */
  getByType(type: IdeaKeyType): string[] {
    return Array.from(this.keys).filter((k) => k.startsWith(`${type}:`));
  }

  /**
   * Get count of explained ideas
   */
  get size(): number {
    return this.keys.size;
  }

  /**
   * Clear all explained ideas
   */
  clear(): void {
    this.keys.clear();
  }

  /**
   * Export keys for serialization
   */
  export(): string[] {
    return Array.from(this.keys);
  }

  /**
   * Import keys from serialization
   */
  import(keys: string[]): void {
    this.keys = new Set(keys);
  }
}

/**
 * Create a new idea key set
 */
export function createIdeaKeySet(): IdeaKeySet {
  return new IdeaKeySet();
}

/**
 * Check redundancy between themes based on idea keys
 *
 * Returns true if the theme's idea has already been explained
 */
export function isThemeRedundant(theme: ThemeInstance, explainedIdeas: IdeaKeySet): boolean {
  const ideaKey = generateThemeIdeaKey(theme);
  return explainedIdeas.has(ideaKey);
}

/**
 * Filter themes to only include non-redundant ones
 */
export function filterNonRedundantThemes(
  themes: ThemeInstance[],
  explainedIdeas: IdeaKeySet,
): ThemeInstance[] {
  return themes.filter((theme) => !isThemeRedundant(theme, explainedIdeas));
}

/**
 * Generate canonical concept name for a theme type
 */
export function getConceptName(themeType: ThemeType): string {
  const names: Record<string, string> = {
    // Tactical
    absolute_pin: 'pinned piece cannot move',
    relative_pin: 'moving piece loses material',
    fork: 'double attack',
    skewer: 'x-ray attack',
    discovered_attack: 'uncovered attack',
    double_attack: 'attacking two targets',
    overloaded_piece: 'defender has too many duties',
    deflection: 'luring defender away',
    decoy: 'forcing piece to worse square',
    removal_of_guard: 'eliminating defender',
    back_rank_threat: 'vulnerable back rank',
    zwischenzug: 'in-between move',

    // Structural
    isolated_pawn: 'pawn without neighbors',
    doubled_pawns: 'pawns on same file',
    backward_pawn: 'pawn that cannot advance safely',
    passed_pawn: 'pawn that cannot be stopped by pawns',
    connected_passers: 'mutually supporting passed pawns',
    pawn_majority: 'more pawns on a wing',
    pawn_chain: 'diagonal pawn structure',

    // Positional
    outpost: 'strong piece placement',
    weak_square: 'undefendable by pawns',
    weak_complex: 'multiple weak squares',
    bishop_pair: 'two bishops advantage',
    bad_bishop: 'bishop blocked by own pawns',
    knight_on_rim: 'knight on edge is dim',
    piece_activity: 'piece mobility and scope',
    space_advantage: 'controlling more squares',

    // Dynamic
    king_in_center: 'uncastled king',
    king_safety: 'king shelter quality',
    open_file: 'no pawns blocking file',
    half_open_file: 'one side has no pawn',
    development_lead: 'more pieces developed',
    initiative: 'dictating the action',
  };

  return names[themeType] ?? themeType.replace(/_/g, ' ');
}

/**
 * Get category-specific concept groupings
 */
export function getConceptGroup(category: ThemeCategory): string[] {
  const groups: Record<ThemeCategory, string[]> = {
    tactical: ['attacks', 'pins and skewers', 'discovered attacks', 'defensive weaknesses'],
    structural: ['pawn structure', 'passed pawns', 'weak pawns'],
    positional: ['piece placement', 'square control', 'bishops'],
    dynamic: ['king safety', 'open lines', 'development'],
  };

  return groups[category] ?? [];
}
