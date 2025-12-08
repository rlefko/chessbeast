/**
 * Test Position Fixtures
 *
 * Comprehensive test positions for theme detection testing.
 * Each position has a FEN, description, and expected detection result.
 */

import type { TacticalThemeId, PositionalThemeId, Color } from '../types.js';

export interface TestPosition {
  fen: string;
  description: string;
  expected: ExpectedTheme | ExpectedTheme[] | null;
}

export interface ExpectedTheme {
  id: TacticalThemeId | PositionalThemeId;
  squares?: string[];
  pieces?: string[];
  beneficiary?: Color;
}

// ============================================================================
// PIN POSITIONS
// ============================================================================

export const PIN_POSITIONS: Record<string, TestPosition> = {
  // Absolute pins
  absolutePinBishop: {
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p1B1/4P3/5N2/PPPP1PPP/RN1QKB1R b KQkq - 5 4',
    description: 'Bishop on g5 pins knight on f6 to black king',
    expected: { id: 'absolute_pin', squares: ['g5', 'f6', 'e8'], beneficiary: 'w' },
  },
  absolutePinRook: {
    fen: 'r3k2r/ppp2ppp/2nq1n2/3p4/3P4/2N2N2/PPP2PPP/R1BQK2R w KQkq - 0 8',
    description: 'If Bg5, knight would be pinned to queen',
    expected: null, // No pin exists yet
  },
  absolutePinOnFile: {
    fen: '4k3/8/8/8/4n3/8/8/4R2K w - - 0 1',
    description: 'Rook pins knight to black king on e-file',
    expected: { id: 'absolute_pin', squares: ['e1', 'e4', 'e8'], beneficiary: 'w' },
  },

  // Relative pins
  relativePinBishop: {
    fen: 'r1bqk2r/pppp1ppp/2n2n2/4p3/1bB1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4',
    description: 'Bishop pins knight on c3 to white queen',
    expected: { id: 'relative_pin', beneficiary: 'b' },
  },
  relativePinRook: {
    fen: 'r3k2r/ppp1qppp/2n2n2/3p4/3P4/2N2N2/PPP1QPPP/R1B1K2R w KQkq - 0 8',
    description: 'Rook could pin if file opens',
    expected: null, // Potential pin, not actual
  },
  relativePinToRook: {
    fen: '4k3/8/8/8/4n3/8/8/4RR1K w - - 0 1',
    description: 'First rook pins knight to second rook',
    expected: { id: 'relative_pin', beneficiary: 'w' },
  },

  // Cross-pins
  crossPinDiagonals: {
    fen: '4k3/8/2b3B1/8/4n3/8/2B3b1/4K3 w - - 0 1',
    description: 'Knight pinned from two diagonal directions',
    expected: { id: 'cross_pin', squares: ['e4'], beneficiary: 'w' },
  },

  // Situational pins
  situationalPin: {
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    description: 'Knight screens f7 from bishop attack',
    expected: { id: 'situational_pin', beneficiary: 'w' },
  },

  // No pin positions
  noPinStarting: {
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    description: 'No pins in this position',
    expected: null,
  },
};

// ============================================================================
// FORK POSITIONS
// ============================================================================

export const FORK_POSITIONS: Record<string, TestPosition> = {
  // Knight forks
  knightForkRoyalFamily: {
    fen: '4k3/8/8/4N3/8/8/8/4K3 w - - 0 1',
    description: 'Knight ready to fork king and imaginary targets',
    expected: null, // No actual fork
  },
  knightForkKingQueen: {
    fen: 'r1bqk2r/pppp1ppp/2n5/2b1N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 5',
    description: 'Ne5 forks king and c6 knight',
    expected: { id: 'knight_fork', beneficiary: 'w' },
  },
  knightForkRookBishop: {
    fen: 'r3kb1r/pppp1ppp/2n5/4N3/8/8/PPPP1PPP/RNBQKB1R w KQkq - 0 5',
    description: 'Knight on e5 attacks multiple pieces',
    expected: { id: 'knight_fork', beneficiary: 'w' },
  },
  knightForkFamilyFork: {
    fen: 'r2qk2r/ppp2ppp/2n5/3nN3/8/8/PPPP1PPP/RNBQKB1R w KQkq - 0 8',
    description: 'Ne5 attacks king, queen, and rook',
    expected: { id: 'knight_fork', beneficiary: 'w' },
  },

  // Pawn forks
  pawnForkMinorPieces: {
    fen: 'r1bqkbnr/pppp1ppp/2n5/4P3/2B5/8/PPP2PPP/RNBQK1NR b KQkq - 0 3',
    description: 'e5 pawn forks c6 and could fork',
    expected: null, // Check if actual fork exists
  },
  pawnForkActual: {
    fen: 'r1bqkbnr/ppp2ppp/2n5/3pP3/2B5/8/PPP2PPP/RNBQK1NR w KQkq d6 0 4',
    description: 'Pawn on e5 attacks d6 after d5',
    expected: null, // Not forking yet
  },

  // Generic forks
  queenFork: {
    fen: '4k3/8/8/3Q4/8/8/8/4K2r w - - 0 1',
    description: 'Queen attacks king and rook',
    expected: { id: 'fork', beneficiary: 'w' },
  },
  bishopFork: {
    fen: '4k3/8/8/2B5/8/8/8/r3K2r w - - 0 1',
    description: 'Bishop attacks both rooks',
    expected: { id: 'fork', beneficiary: 'w' },
  },

  // Double attack
  doubleAttack: {
    fen: '4k3/8/4Q3/8/8/8/8/4K2r w - - 0 1',
    description: 'Queen attacks king (check) and rook',
    expected: { id: 'double_attack', beneficiary: 'w' },
  },

  // Double check
  doubleCheck: {
    fen: '4k3/8/5N2/8/2B5/8/8/4K3 w - - 0 1',
    description: 'Setup for double check',
    expected: null, // Not currently double check
  },
  doubleCheckActual: {
    fen: 'rnb1k1nr/pppp1ppp/8/4p3/1bB1N3/8/PPPP1PPP/RNBQK2R b KQkq - 0 4',
    description: 'Both bishop and knight give check',
    expected: { id: 'double_check', beneficiary: 'w' },
  },

  // No fork
  noFork: {
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    description: 'No forks in this position',
    expected: null,
  },
};

// ============================================================================
// SKEWER POSITIONS
// ============================================================================

export const SKEWER_POSITIONS: Record<string, TestPosition> = {
  // Skewers (valuable piece in front)
  skewerKingQueen: {
    fen: '4k3/4q3/8/8/8/8/8/4RK2 w - - 0 1',
    description: 'Rook skewers king to queen',
    expected: { id: 'skewer', beneficiary: 'w' },
  },
  skewerQueenRook: {
    fen: '4k3/4r3/8/8/4B3/8/8/4K3 w - - 0 1',
    description: 'Bishop skewers queen to rook on diagonal',
    expected: null, // No queen present
  },
  skewerRookBishop: {
    fen: '4k3/8/8/4r3/8/8/4b3/4RK2 w - - 0 1',
    description: 'Rook skewers rook to bishop',
    expected: { id: 'skewer', beneficiary: 'w' },
  },

  // X-ray attacks
  xrayAttackRook: {
    fen: '4k3/4p3/8/8/4R3/8/8/4K3 w - - 0 1',
    description: 'Rook x-rays through pawn to king',
    expected: { id: 'x_ray_attack', beneficiary: 'w' },
  },
  xrayAttackBishop: {
    fen: '4k3/8/2n5/8/B7/8/8/4K3 w - - 0 1',
    description: 'Bishop x-rays through knight',
    expected: { id: 'x_ray_attack', beneficiary: 'w' },
  },

  // X-ray defense
  xrayDefenseRook: {
    fen: '4k3/8/8/8/4n3/8/4R3/4RK2 w - - 0 1',
    description: 'Back rook x-ray defends through front rook',
    expected: { id: 'x_ray_defense', beneficiary: 'w' },
  },

  // No skewer
  noSkewer: {
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    description: 'No skewers in this position',
    expected: null,
  },
};

// ============================================================================
// DISCOVERY POSITIONS
// ============================================================================

export const DISCOVERY_POSITIONS: Record<string, TestPosition> = {
  // Discovered attack
  discoveredAttackBishop: {
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
    description: 'Moving knight discovers bishop attack on f7',
    expected: { id: 'discovered_attack', beneficiary: 'w' },
  },
  discoveredAttackRook: {
    fen: '4k3/8/8/8/4N3/8/8/4RK2 w - - 0 1',
    description: 'Moving knight discovers rook attack on king',
    expected: { id: 'discovered_check', beneficiary: 'w' },
  },

  // Discovered check
  discoveredCheckKnight: {
    fen: '4k3/8/8/3N4/8/8/4B3/4K3 w - - 0 1',
    description: 'Moving knight discovers bishop check',
    expected: { id: 'discovered_check', beneficiary: 'w' },
  },
  discoveredCheckPawn: {
    fen: '4k3/8/4P3/8/8/8/4R3/4K3 w - - 0 1',
    description: 'Moving pawn discovers rook check',
    expected: { id: 'discovered_check', beneficiary: 'w' },
  },

  // No discovery
  noDiscovery: {
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    description: 'No discovered attacks available',
    expected: null,
  },
};

// ============================================================================
// BATTERY POSITIONS
// ============================================================================

export const BATTERY_POSITIONS: Record<string, TestPosition> = {
  // Queen-bishop battery
  queenBishopDiagonal: {
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/1Q3N2/PPPP1PPP/RNB1K2R w KQkq - 0 4',
    description: 'Queen and bishop battery on b3-f7 diagonal',
    expected: { id: 'queen_bishop_battery', beneficiary: 'w' },
  },
  queenBishopFile: {
    fen: '4k3/8/8/8/8/8/4Q3/4BK2 w - - 0 1',
    description: 'Queen and bishop aligned on e-file',
    expected: { id: 'battery', beneficiary: 'w' },
  },

  // Doubled rooks
  rooksDoubledFile: {
    fen: '4k3/8/8/8/8/8/4R3/4RK2 w - - 0 1',
    description: 'Two rooks doubled on e-file',
    expected: { id: 'rooks_doubled', beneficiary: 'w' },
  },
  rooksDoubledRank: {
    fen: '4k3/8/8/8/8/8/RR6/4K3 w - - 0 1',
    description: 'Two rooks doubled on 2nd rank',
    expected: { id: 'rooks_doubled', beneficiary: 'w' },
  },

  // Alekhine's gun
  alekhinesGun: {
    fen: '4k3/8/8/8/8/4Q3/4R3/4RK2 w - - 0 1',
    description: 'Queen behind two rooks - Alekhines gun',
    expected: { id: 'alekhines_gun', beneficiary: 'w' },
  },

  // Rooks on 7th
  rooksSeventh: {
    fen: '4k3/RR6/8/8/8/8/8/4K3 w - - 0 1',
    description: 'Two white rooks on 7th rank',
    expected: { id: 'rooks_seventh', beneficiary: 'w' },
  },
  rooksSecond: {
    fen: '4K3/8/8/8/8/8/rr6/4k3 b - - 0 1',
    description: 'Two black rooks on 2nd rank',
    expected: { id: 'rooks_seventh', beneficiary: 'b' },
  },

  // Generic battery
  bishopQueenBattery: {
    fen: '4k3/8/8/8/8/5B2/6Q1/4K3 w - - 0 1',
    description: 'Bishop and queen on diagonal',
    expected: { id: 'battery', beneficiary: 'w' },
  },

  // No battery
  noBattery: {
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    description: 'No batteries in opening position',
    expected: null,
  },
};

// ============================================================================
// WEAKNESS POSITIONS
// ============================================================================

export const WEAKNESS_POSITIONS: Record<string, TestPosition> = {
  // Back rank weakness
  backRankClassic: {
    fen: '6k1/ppp2ppp/8/8/8/8/PPP2PPP/R5K1 w - - 0 1',
    description: 'Classic back rank weakness - king trapped',
    expected: { id: 'back_rank_weakness', beneficiary: 'w' },
  },
  backRankWithLuft: {
    fen: '6k1/ppp2pp1/7p/8/8/8/PPP2PPP/R5K1 w - - 0 1',
    description: 'Back rank with luft (h6) - less weak',
    expected: null,
  },
  backRankBlack: {
    fen: 'r5k1/ppp2ppp/8/8/8/8/PPP2PPP/6K1 b - - 0 1',
    description: 'Black has back rank weakness',
    expected: { id: 'back_rank_weakness', beneficiary: 'b' },
  },

  // f2/f7 weakness
  f7WeaknessEarly: {
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 2',
    description: 'f7 is weak early - only defended by king',
    expected: { id: 'f2_f7_weakness', beneficiary: 'w' },
  },
  f2WeaknessEarly: {
    fen: 'rnbqk1nr/pppp1ppp/8/2b1p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 2 2',
    description: 'f2 is weak - bishop targeting',
    expected: { id: 'f2_f7_weakness', beneficiary: 'b' },
  },

  // Trapped piece
  trappedBishopA7: {
    fen: 'rn1qkbnr/Bppppppp/8/8/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 0 3',
    description: 'Bishop trapped on a7',
    expected: { id: 'trapped_piece', beneficiary: 'b' },
  },
  trappedKnight: {
    fen: 'rnbqkbnr/pppppppp/N7/8/8/8/PPPPPPPP/R1BQKBNR b KQkq - 0 2',
    description: 'Knight trapped on a6',
    expected: { id: 'trapped_piece', beneficiary: 'b' },
  },

  // No weakness
  noWeakness: {
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4',
    description: 'Balanced position without major weaknesses',
    expected: null,
  },
};

// ============================================================================
// DEFENDER POSITIONS
// ============================================================================

export const DEFENDER_POSITIONS: Record<string, TestPosition> = {
  // Overloaded piece
  overloadedQueen: {
    fen: '4k3/8/8/3n4/8/2q5/8/R3K2R w K - 0 1',
    description: 'Queen defends both knight and rook',
    expected: { id: 'overloaded_piece', beneficiary: 'w' },
  },
  overloadedKnight: {
    fen: '4k3/8/3n4/8/2b1r3/8/8/4K3 w - - 0 1',
    description: 'Knight defends both bishop and rook',
    expected: { id: 'overloaded_piece', beneficiary: 'w' },
  },

  // Remove defender
  removeDefender: {
    fen: '4k3/4r3/4n3/8/8/8/4B3/4K3 w - - 0 1',
    description: 'Capturing knight removes defender of rook',
    expected: { id: 'remove_defender', beneficiary: 'w' },
  },

  // Deflection
  deflection: {
    fen: '4k3/4q3/8/8/8/8/4R3/4K3 w - - 0 1',
    description: 'Rook deflects queen from defense',
    expected: { id: 'deflection', beneficiary: 'w' },
  },

  // Desperado
  desperado: {
    fen: '4k3/8/8/3Nb3/8/8/8/4K3 w - - 0 1',
    description: 'Knight can take before being captured',
    expected: { id: 'desperado', beneficiary: 'w' },
  },

  // No defender issues
  noDefenderIssue: {
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    description: 'No defender tactics available',
    expected: null,
  },
};

// ============================================================================
// ENDGAME POSITIONS
// ============================================================================

export const ENDGAME_POSITIONS: Record<string, TestPosition> = {
  // Opposition
  directOpposition: {
    fen: '8/8/8/4k3/8/4K3/8/8 w - - 0 1',
    description: 'Kings in direct opposition',
    expected: { id: 'opposition' },
  },
  distantOppositionFile: {
    fen: '8/8/8/k7/8/8/8/K7 w - - 0 1',
    description: 'Kings in distant opposition on a-file',
    expected: { id: 'opposition' },
  },
  distantOppositionRank: {
    fen: '8/8/8/8/k6K/8/8/8 w - - 0 1',
    description: 'Kings in distant opposition on 4th rank',
    expected: { id: 'opposition' },
  },
  diagonalOpposition: {
    fen: '8/8/8/4k3/8/2K5/8/8 w - - 0 1',
    description: 'Kings in diagonal opposition',
    expected: { id: 'opposition' },
  },

  // Triangulation
  triangulationSetup: {
    fen: '8/8/8/8/1k6/8/1PK5/8 w - - 0 1',
    description: 'White can triangulate to win',
    expected: { id: 'triangulation' },
  },

  // Zugzwang
  zugzwangSimple: {
    fen: '8/8/8/1k6/1P6/1K6/8/8 b - - 0 1',
    description: 'Black to move in zugzwang',
    expected: { id: 'zugzwang', beneficiary: 'w' },
  },
  zugzwangComplex: {
    fen: '8/8/p1p5/P1P5/1k6/8/1K6/8 b - - 0 1',
    description: 'Complex zugzwang with pawns',
    expected: { id: 'zugzwang', beneficiary: 'w' },
  },

  // No endgame theme
  noEndgameTheme: {
    fen: '8/8/8/4k3/8/8/4K3/8 w - - 0 1',
    description: 'Kings not in opposition',
    expected: null,
  },
};

// ============================================================================
// SPECIAL TACTICS POSITIONS
// ============================================================================

export const SPECIAL_POSITIONS: Record<string, TestPosition> = {
  // Greek gift
  greekGiftSetup: {
    fen: 'r1bqk2r/ppp2ppp/2n2n2/3pp3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5',
    description: 'Classic Greek gift setup - Bxh7+ possible',
    expected: { id: 'greek_gift', beneficiary: 'w' },
  },
  greekGiftPossible: {
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 4',
    description: 'Greek gift not immediately possible',
    expected: null,
  },

  // Zwischenzug
  zwischenzugOpportunity: {
    fen: '4k3/8/8/4p3/3P4/8/8/4K3 w - - 0 1',
    description: 'Intermediate move available before recapture',
    expected: null, // Simplified position
  },

  // Windmill
  windmillSetup: {
    fen: '4k3/8/8/8/8/8/4R3/4K3 w - - 0 1',
    description: 'Potential windmill setup',
    expected: null,
  },

  // Sacrifice
  sacrificeForMate: {
    fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
    description: 'Sacrifice setup for back rank mate',
    expected: { id: 'sacrifice', beneficiary: 'w' },
  },
};

// ============================================================================
// PAWN TACTICS POSITIONS
// ============================================================================

export const PAWN_TACTICS_POSITIONS: Record<string, TestPosition> = {
  // Advanced pawn
  advancedPawnSixth: {
    fen: '4k3/8/4P3/8/8/8/8/4K3 w - - 0 1',
    description: 'White pawn on 6th rank',
    expected: { id: 'advanced_pawn', squares: ['e6'], beneficiary: 'w' },
  },
  advancedPawnSeventh: {
    fen: '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1',
    description: 'White pawn on 7th rank - very advanced',
    expected: { id: 'advanced_pawn', squares: ['e7'], beneficiary: 'w' },
  },
  advancedPawnBlack: {
    fen: '4k3/8/8/8/8/4p3/8/4K3 b - - 0 1',
    description: 'Black pawn on 3rd rank',
    expected: { id: 'advanced_pawn', squares: ['e3'], beneficiary: 'b' },
  },

  // Pawn breakthrough
  pawnBreakthrough: {
    fen: '4k3/8/3ppp2/3PPP2/8/8/8/4K3 w - - 0 1',
    description: 'Pawn breakthrough available',
    expected: { id: 'pawn_breakthrough', beneficiary: 'w' },
  },

  // Underpromotion
  underpromotion: {
    fen: '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1',
    description: 'Underpromotion might be necessary',
    expected: null, // Context dependent
  },

  // No pawn tactics
  noPawnTactics: {
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    description: 'No pawn tactics in opening',
    expected: null,
  },
};

// ============================================================================
// POSITIONAL POSITIONS
// ============================================================================

export const PAWN_STRUCTURE_POSITIONS: Record<string, TestPosition> = {
  // Isolated pawns
  isolatedDPawn: {
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 2',
    description: 'Isolated d-pawn for both sides',
    expected: { id: 'isolated_pawn' },
  },
  isolatedCPawn: {
    fen: 'rnbqkbnr/pp2pppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    description: 'Isolated c-pawn for black',
    expected: { id: 'isolated_pawn' },
  },

  // Doubled pawns
  doubledCPawns: {
    fen: 'rnbqkbnr/pp1ppppp/8/2p5/2PP4/2P5/PP2PPPP/RNBQKBNR w KQkq - 0 3',
    description: 'White has doubled c-pawns',
    expected: { id: 'doubled_pawns' },
  },
  doubledFPawns: {
    fen: 'rnbqkbnr/ppppp1pp/5p2/8/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2',
    description: 'Both sides have doubled f-pawns potential',
    expected: null, // Not doubled yet
  },

  // Backward pawns
  backwardDPawn: {
    fen: 'rnbqkbnr/pp2pppp/3p4/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    description: 'Black d-pawn is backward',
    expected: { id: 'backward_pawn' },
  },

  // Passed pawns
  passedDPawn: {
    fen: '4k3/8/8/3P4/8/8/8/4K3 w - - 0 1',
    description: 'White d-pawn is passed',
    expected: { id: 'passed_pawn', squares: ['d5'] },
  },
  passedConnected: {
    fen: '4k3/8/8/3PP3/8/8/8/4K3 w - - 0 1',
    description: 'Connected passed pawns',
    expected: [{ id: 'passed_pawn', squares: ['d5', 'e5'] }],
  },

  // Pawn break
  pawnBreakD5: {
    fen: 'rnbqkbnr/ppp1pppp/3p4/8/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 2',
    description: 'd5 pawn break available',
    expected: { id: 'pawn_break_available' },
  },
  pawnBreakC4: {
    fen: 'rnbqkbnr/pppp1ppp/4p3/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',
    description: 'c4 pawn break available',
    expected: { id: 'pawn_break_available' },
  },

  // Pawn majority
  queensideMajority: {
    fen: '4k3/pp6/8/8/8/8/PPP5/4K3 w - - 0 1',
    description: 'White has queenside pawn majority',
    expected: { id: 'pawn_majority', beneficiary: 'w' },
  },

  // Weak pawn (generic)
  weakPawn: {
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2',
    description: 'Black d5 pawn could become weak',
    expected: { id: 'weak_pawn' },
  },

  // Steamrolling
  steamrolling: {
    fen: '8/8/3PP3/3PP3/8/8/8/4K2k w - - 0 1',
    description: 'Connected pawns steamrolling forward',
    expected: { id: 'steamrolling', beneficiary: 'w' },
  },
};

export const OUTPOST_POSITIONS: Record<string, TestPosition> = {
  // Weak squares
  weakD5: {
    fen: 'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3',
    description: 'd5 is a weak square for black',
    expected: { id: 'weak_square', squares: ['d5'] },
  },
  weakF5: {
    fen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    description: 'f5 could become weak',
    expected: null, // Not yet weak
  },

  // Outposts
  knightOutpostE5: {
    fen: 'rnbqkb1r/pppp1ppp/5n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    description: 'Knight outpost on e5',
    expected: { id: 'outpost', squares: ['e5'] },
  },
  knightOutpostD5: {
    fen: 'rnbqkb1r/ppp2ppp/4pn2/3pN3/3PP3/8/PPP2PPP/RNBQKB1R w KQkq - 0 4',
    description: 'Potential knight outpost on d5',
    expected: { id: 'outpost', squares: ['d5'] },
  },

  // Power outpost (piece on outpost)
  powerOutpost: {
    fen: 'rnbqkb1r/pppp1ppp/8/4N3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 3',
    description: 'Knight on strong outpost e5',
    expected: { id: 'power_outpost', squares: ['e5'] },
  },

  // Pseudo outpost
  pseudoOutpost: {
    fen: 'rnbqkb1r/pppp1ppp/5n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 3',
    description: 'Outpost that can be contested',
    expected: { id: 'pseudo_outpost', squares: ['e5'] },
  },

  // Entry square
  entrySquare: {
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4',
    description: 'd5 is an entry square',
    expected: { id: 'entry_square' },
  },
};

export const FILE_POSITIONS: Record<string, TestPosition> = {
  // Open file
  openEFile: {
    fen: 'r3kb1r/ppp2ppp/2n1bn2/3p4/3P4/2N1BN2/PPP2PPP/R3KB1R w KQkq - 0 6',
    description: 'e-file is fully open',
    expected: { id: 'open_file' },
  },
  openDFile: {
    fen: 'r1bqk2r/ppp2ppp/2n2n2/3Pp3/8/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 6',
    description: 'd-file is open',
    expected: { id: 'open_file' },
  },

  // Semi-open file
  semiOpenCFile: {
    fen: 'r1bqkb1r/pp1ppppp/2n2n2/2p5/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 2 4',
    description: 'c-file semi-open for white',
    expected: { id: 'semi_open_file' },
  },
  semiOpenEFile: {
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    description: 'e-file could become semi-open',
    expected: null, // Not semi-open yet
  },
};

export const SPACE_POSITIONS: Record<string, TestPosition> = {
  // Space advantage
  whiteSpaceAdvantage: {
    fen: 'rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 2',
    description: 'White has space advantage in center',
    expected: { id: 'space_advantage', beneficiary: 'w' },
  },
  blackSpaceAdvantage: {
    fen: 'rnbqkbnr/ppp2ppp/3p4/3Pp3/8/8/PPP1PPPP/RNBQKBNR w KQkq - 0 3',
    description: 'Black has counterplay in center',
    expected: null, // Roughly equal
  },

  // Central control
  whiteCentralControl: {
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2',
    description: 'White controls center with pawns',
    expected: { id: 'central_control', beneficiary: 'w' },
  },

  // Convergence zone
  convergenceZone: {
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    description: 'Pieces converge on f7',
    expected: { id: 'convergence_zone', squares: ['f7'] },
  },
};

export const ACTIVITY_POSITIONS: Record<string, TestPosition> = {
  // Development lead
  developmentLead: {
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    description: 'White has slight development lead',
    expected: { id: 'development_lead', beneficiary: 'w' },
  },
  largeDevelopmentLead: {
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/2N2N2/PPPP1PPP/R1BQKB1R b KQkq - 3 3',
    description: 'White has significant development lead',
    expected: { id: 'development_lead', beneficiary: 'w' },
  },

  // Activity advantage
  activityAdvantage: {
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    description: 'White pieces more active',
    expected: { id: 'activity_advantage', beneficiary: 'w' },
  },

  // Piece passivity
  piecePassivity: {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    description: 'All pieces passive in starting position',
    expected: null, // Both passive
  },

  // Paralysis
  paralysis: {
    fen: 'r1bqk2r/pppp1ppp/2n2n2/4p3/1bB1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4',
    description: 'Pieces restricted by structure',
    expected: null, // Not paralysis
  },
};

export const COLOR_POSITIONS: Record<string, TestPosition> = {
  // Color weakness
  lightSquareWeakness: {
    fen: 'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4',
    description: 'Light squares weak after bishop exchange',
    expected: { id: 'color_weakness' },
  },
  darkSquareWeakness: {
    fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    description: 'Dark squares could become weak',
    expected: null, // Not weak yet
  },

  // Fortress
  fortress: {
    fen: '8/8/1k6/3K4/8/8/8/8 w - - 0 1',
    description: 'Simple king vs king - drawish fortress',
    expected: null, // Not a fortress
  },
};

// ============================================================================
// INTEGRATION TEST POSITIONS (Multiple Themes)
// ============================================================================

export const INTEGRATION_POSITIONS: Record<string, TestPosition> = {
  multipleThemes: {
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p1B1/2B1P3/5N2/PPPP1PPP/RN1QK2R b KQkq - 5 4',
    description: 'Position with pin, development lead, and f7 weakness',
    expected: [
      { id: 'absolute_pin', beneficiary: 'w' },
      { id: 'f2_f7_weakness', beneficiary: 'w' },
      { id: 'development_lead', beneficiary: 'w' },
    ],
  },
  tacticalPosition: {
    fen: '4k3/4q3/8/8/4N3/8/4R3/4K3 w - - 0 1',
    description: 'Multiple tactical motifs',
    expected: [{ id: 'fork', beneficiary: 'w' }],
  },
  positionalPosition: {
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/3PP3/2N2N2/PPP2PPP/R1BQKB1R b KQkq - 0 4',
    description: 'Positional with space and development',
    expected: [
      { id: 'space_advantage', beneficiary: 'w' },
      { id: 'central_control', beneficiary: 'w' },
    ],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all positions for a specific theme category
 */
export function getPositionsForCategory(category: 'tactical' | 'positional'): TestPosition[] {
  if (category === 'tactical') {
    return [
      ...Object.values(PIN_POSITIONS),
      ...Object.values(FORK_POSITIONS),
      ...Object.values(SKEWER_POSITIONS),
      ...Object.values(DISCOVERY_POSITIONS),
      ...Object.values(BATTERY_POSITIONS),
      ...Object.values(WEAKNESS_POSITIONS),
      ...Object.values(DEFENDER_POSITIONS),
      ...Object.values(ENDGAME_POSITIONS),
      ...Object.values(SPECIAL_POSITIONS),
      ...Object.values(PAWN_TACTICS_POSITIONS),
    ];
  } else {
    return [
      ...Object.values(PAWN_STRUCTURE_POSITIONS),
      ...Object.values(OUTPOST_POSITIONS),
      ...Object.values(FILE_POSITIONS),
      ...Object.values(SPACE_POSITIONS),
      ...Object.values(ACTIVITY_POSITIONS),
      ...Object.values(COLOR_POSITIONS),
    ];
  }
}

/**
 * Get all test positions
 */
export function getAllPositions(): TestPosition[] {
  return [...getPositionsForCategory('tactical'), ...getPositionsForCategory('positional')];
}
