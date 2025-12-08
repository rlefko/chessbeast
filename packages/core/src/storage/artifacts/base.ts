/**
 * Base artifact interfaces for the Position Artifact Store
 *
 * Artifacts are immutable, keyed analysis results that can be:
 * - Cached for reuse across positions (transpositions)
 * - Persisted to disk (future SQLite integration)
 * - Referenced by position keys for lazy loading
 *
 * Design principles:
 * - Treat analysis as immutable "facts"
 * - Key everything for cache retrieval
 * - Version artifacts for forward compatibility
 */

/**
 * Analysis tier determines the depth and included features
 *
 * - shallow: Quick analysis for all positions (depth 10-12, multipv 1)
 * - standard: Detailed analysis for critical positions (depth 16-18, multipv 3)
 * - full: Deep analysis for forcing lines (depth 20-24, multipv 5-8)
 */
export type AnalysisTier = 'shallow' | 'standard' | 'full';

/**
 * Artifact kinds - discriminator for type narrowing
 */
export type ArtifactKind = 'engine_eval' | 'themes' | 'candidates' | 'move_assessment' | 'hce';

/**
 * Base interface for all immutable analysis artifacts
 *
 * All artifacts share:
 * - A kind discriminator for type narrowing
 * - A position key linking to the position
 * - Creation timestamp for cache management
 * - Schema version for migration support
 */
export interface BaseArtifact {
  /** Artifact type discriminator */
  readonly kind: ArtifactKind;

  /** Position this artifact belongs to (zobrist:normalizedFen format) */
  readonly positionKey: string;

  /** When the artifact was computed (ISO 8601) */
  readonly createdAt: string;

  /** Schema version for forward compatibility */
  readonly schemaVersion: number;
}

/**
 * Reference to a stored artifact
 *
 * Used in VariationNode to link to artifacts without embedding full data.
 * Enables lazy loading and reduces memory footprint.
 */
export interface ArtifactRef {
  /** Artifact kind for type discrimination */
  kind: ArtifactKind;

  /** Full artifact key for cache retrieval */
  artifactKey: string;

  /** Analysis tier (if applicable) */
  tier?: AnalysisTier;
}

/**
 * Tier configuration for staged analysis
 */
export interface TierConfig {
  /** Analysis tier identifier */
  tier: AnalysisTier;

  /** Engine search depth */
  depth: number;

  /** Time limit in milliseconds */
  timeLimitMs: number;

  /** Number of principal variations */
  multipv: number;

  /** Minimum time for mate detection */
  mateMinTimeMs: number;
}

/**
 * Default tier configurations
 */
export const TIER_CONFIGS: Record<AnalysisTier, TierConfig> = {
  shallow: {
    tier: 'shallow',
    depth: 12,
    timeLimitMs: 1500,
    multipv: 1,
    mateMinTimeMs: 2000,
  },
  standard: {
    tier: 'standard',
    depth: 18,
    timeLimitMs: 5000,
    multipv: 3,
    mateMinTimeMs: 4000,
  },
  full: {
    tier: 'full',
    depth: 22,
    timeLimitMs: 15000,
    multipv: 5,
    mateMinTimeMs: 6000,
  },
};

/**
 * Get tier config, defaulting to shallow if invalid
 */
export function getTierConfig(tier: AnalysisTier): TierConfig {
  return TIER_CONFIGS[tier] ?? TIER_CONFIGS.shallow;
}

/**
 * Check if a tier is at least as deep as another
 */
export function tierAtLeast(tier: AnalysisTier, minTier: AnalysisTier): boolean {
  const tierOrder: Record<AnalysisTier, number> = {
    shallow: 0,
    standard: 1,
    full: 2,
  };
  return tierOrder[tier] >= tierOrder[minTier];
}

/**
 * Generate artifact key for engine evaluation
 *
 * @param positionKey - Position key string
 * @param depth - Search depth
 * @param multipv - Number of principal variations
 * @param engineVersion - Engine version string
 * @param optionsHash - Hash of engine options
 * @returns Unique artifact key
 */
export function engineEvalArtifactKey(
  positionKey: string,
  depth: number,
  multipv: number,
  engineVersion: string,
  optionsHash: string,
): string {
  return `engine_eval:${positionKey}:d${depth}:pv${multipv}:${engineVersion}:${optionsHash}`;
}

/**
 * Generate artifact key for theme detection
 *
 * @param positionKey - Position key string
 * @param tier - Analysis tier
 * @param detectorVersion - Theme detector version
 * @returns Unique artifact key
 */
export function themeArtifactKey(
  positionKey: string,
  tier: AnalysisTier,
  detectorVersion: string,
): string {
  return `themes:${positionKey}:${tier}:${detectorVersion}`;
}

/**
 * Generate artifact key for candidate moves
 *
 * @param positionKey - Position key string
 * @param sfDepth - Stockfish depth
 * @param sfMultipv - Stockfish multipv
 * @param maiaModel - Maia model identifier (optional)
 * @param targetRating - Target player rating
 * @returns Unique artifact key
 */
export function candidatesArtifactKey(
  positionKey: string,
  sfDepth: number,
  sfMultipv: number,
  maiaModel: string | undefined,
  targetRating: number,
): string {
  const maiaStr = maiaModel ?? 'none';
  return `candidates:${positionKey}:d${sfDepth}:pv${sfMultipv}:${maiaStr}:r${targetRating}`;
}

/**
 * Generate artifact key for move assessment
 *
 * @param parentPositionKey - Position before the move
 * @param moveUci - Move in UCI notation
 * @returns Unique artifact key
 */
export function moveAssessmentArtifactKey(parentPositionKey: string, moveUci: string): string {
  return `move_assessment:${parentPositionKey}:${moveUci}`;
}

/**
 * Generate artifact key for HCE (classical evaluation)
 *
 * @param positionKey - Position key string
 * @param tier - Analysis tier
 * @returns Unique artifact key
 */
export function hceArtifactKey(positionKey: string, tier: AnalysisTier): string {
  return `hce:${positionKey}:${tier}`;
}

/**
 * Create a base artifact with common fields
 */
export function createBaseArtifact(
  kind: ArtifactKind,
  positionKey: string,
  schemaVersion: number = 1,
): Omit<BaseArtifact, 'kind'> & { kind: ArtifactKind } {
  return {
    kind,
    positionKey,
    createdAt: new Date().toISOString(),
    schemaVersion,
  };
}

/**
 * Check if an artifact matches a reference
 */
export function artifactMatchesRef<T extends BaseArtifact>(artifact: T, ref: ArtifactRef): boolean {
  return artifact.kind === ref.kind;
}
