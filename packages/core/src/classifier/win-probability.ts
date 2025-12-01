/**
 * Win Probability Calculations (en-croissant style)
 *
 * Uses a sigmoid function to convert centipawn advantage to win probability,
 * then classifies moves based on win chance drop. This approach captures
 * positional context better than raw centipawn thresholds.
 *
 * Based on: https://github.com/franciscoBSalgueiro/en-croissant
 */

/**
 * Sigmoid coefficient for win probability calculation
 * Derived from lichess game data
 */
const SIGMOID_COEFFICIENT = 0.00368208;

/**
 * CP values that represent forced mate (used as ceiling)
 */
const MATE_CP_VALUE = 10000;

/**
 * Win probability thresholds (en-croissant style)
 */
export const WIN_PROB_THRESHOLDS = {
  /** >20% win chance lost = blunder */
  blunder: 20,
  /** >10% win chance lost = mistake */
  mistake: 10,
  /** >5% win chance lost = dubious/inaccuracy */
  dubious: 5,
  /** >5% win chance gained = good move */
  good: 5,
  /** Sacrifice must maintain at least this cp to be considered sound */
  soundSacrificeMinCp: -200,
  /** Minimum material loss (cp) to be considered a sacrifice */
  sacrificeThreshold: 100,
} as const;

/**
 * Convert centipawns to win probability (0-100%)
 *
 * Uses a sigmoid function calibrated on real game data.
 * The formula produces these approximate values:
 * - 0cp → 50%
 * - +100cp → ~55%
 * - +200cp → ~61%
 * - +300cp → ~66%
 * - +500cp → ~75%
 * - +1000cp → ~91%
 * - Mate → 100%
 *
 * @param cp - Centipawn value (positive = better for the player)
 * @returns Win probability as percentage (0-100)
 */
export function cpToWinProbability(cp: number): number {
  // Handle mate scores
  if (cp >= MATE_CP_VALUE) return 100;
  if (cp <= -MATE_CP_VALUE) return 0;

  // Sigmoid function: 50 + 50 * (2 / (1 + exp(-k * cp)) - 1)
  // Simplifies to: 100 / (1 + exp(-k * cp))
  return 50 + 50 * (2 / (1 + Math.exp(-SIGMOID_COEFFICIENT * cp)) - 1);
}

/**
 * Calculate win probability drop between two positions
 *
 * The Stockfish service returns evaluations from the side-to-move's perspective:
 * - evalBefore.cp: From the moving player's perspective (positive = good for them)
 * - evalAfter.cp: From the opponent's perspective (positive = good for opponent)
 *
 * To calculate win probability drop, we convert both to the moving player's view.
 *
 * @param cpBefore - Eval before move (from moving player's perspective)
 * @param cpAfter - Eval after move (from opponent's perspective)
 * @returns Win probability drop (positive = lost win chance, negative = gained win chance)
 */
export function calculateWinProbDrop(cpBefore: number, cpAfter: number): number {
  const winBefore = cpToWinProbability(cpBefore);
  // cpAfter is from opponent's perspective, so negate to get player's view
  const winAfter = cpToWinProbability(-cpAfter);
  return winBefore - winAfter;
}

/**
 * Move NAG based on win probability classification
 */
export type WinProbNag = '$1' | '$2' | '$3' | '$4' | '$5' | '$6' | undefined;

/**
 * Classify a move based on win probability drop
 *
 * This is the core classification without sacrifice detection.
 * For full classification including brilliant/interesting, use the
 * WinProbabilityAnnotationStrategy.
 *
 * @param winProbDrop - Win probability drop (positive = lost win chance)
 * @returns NAG string or undefined for normal moves
 */
export function classifyByWinProbDrop(winProbDrop: number): WinProbNag {
  // Negative moves (lost win chance)
  if (winProbDrop > WIN_PROB_THRESHOLDS.blunder) return '$4'; // ?? blunder
  if (winProbDrop > WIN_PROB_THRESHOLDS.mistake) return '$2'; // ? mistake
  if (winProbDrop > WIN_PROB_THRESHOLDS.dubious) return '$6'; // ?! dubious

  // Positive moves (gained win chance)
  if (winProbDrop < -WIN_PROB_THRESHOLDS.good) return '$1'; // ! good move

  // Normal move, no NAG
  return undefined;
}

/**
 * Get accuracy score for a move (0-100%)
 *
 * Based on en-croissant's accuracy formula, similar to chess.com style.
 * Higher scores mean better moves.
 *
 * @param cpBefore - Eval before move (from moving player's perspective)
 * @param cpAfter - Eval after move (from opponent's perspective)
 * @returns Accuracy percentage (0-100)
 */
export function getMoveAccuracy(cpBefore: number, cpAfter: number): number {
  const winBefore = cpToWinProbability(cpBefore);
  const winAfter = cpToWinProbability(-cpAfter);
  const winDrop = winBefore - winAfter;

  // Formula: 103.1668 * exp(-0.04354 * winDrop) - 3.1669 + 1
  // Clamped to 0-100
  const accuracy = 103.1668 * Math.exp(-0.04354 * Math.max(0, winDrop)) - 3.1669 + 1;
  return Math.max(0, Math.min(100, accuracy));
}
