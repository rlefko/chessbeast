/**
 * Stockfish 16 classical evaluation service types
 * Matches definitions in services/protos/stockfish16.proto
 */

/**
 * Middlegame and endgame component scores
 */
export interface PhaseScore {
  /** Middlegame value in pawns */
  mg: number;
  /** Endgame value in pawns */
  eg: number;
}

/**
 * Per-side breakdown for a component
 */
export interface SideBreakdown {
  white: PhaseScore;
  black: PhaseScore;
  total: PhaseScore;
}

/**
 * Request for classical evaluation
 */
export interface ClassicalEvalRequest {
  /** Position in FEN notation */
  fen: string;
}

/**
 * Classical evaluation breakdown response
 * All values are in pawns (positive = good for white)
 */
export interface ClassicalEvalResponse {
  /** Material balance */
  material: SideBreakdown;
  /** Piece imbalance (bishop pair, etc.) */
  imbalance: SideBreakdown;
  /** Pawn structure evaluation */
  pawns: SideBreakdown;
  /** Knight evaluation */
  knights: SideBreakdown;
  /** Bishop evaluation */
  bishops: SideBreakdown;
  /** Rook evaluation */
  rooks: SideBreakdown;
  /** Queen evaluation */
  queens: SideBreakdown;
  /** Piece mobility */
  mobility: SideBreakdown;
  /** King safety */
  kingSafety: SideBreakdown;
  /** Threats (attacks on enemy pieces) */
  threats: SideBreakdown;
  /** Passed pawn evaluation */
  passed: SideBreakdown;
  /** Space control */
  space: SideBreakdown;
  /** Winnable scaling factor */
  winnable: SideBreakdown;
  /** Total evaluation */
  total: SideBreakdown;
  /** Final blended evaluation in centipawns */
  finalEvalCp: number;
}

/**
 * Health check response
 */
export interface Stockfish16HealthCheckResponse {
  healthy: boolean;
  /** Stockfish 16 version string */
  version: string;
}
