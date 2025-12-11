export { ChessPosition, STARTING_FEN } from './position.js';
export type { MoveResult, MoveResultWithUci } from './position.js';

export {
  detectTension,
  hasHangingPieces,
  hasPromotionThreat,
  hasCheckTension,
} from './tension-detector.js';
export type { TensionResult } from './tension-detector.js';

export {
  resolveVariationLength,
  hasTacticalTension,
  getResolutionState,
} from './tension-resolver.js';
export type { TensionConfig, ResolutionState, ResolutionResult } from './tension-resolver.js';
