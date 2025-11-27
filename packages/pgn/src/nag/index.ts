/**
 * NAG (Numeric Annotation Glyph) utilities
 *
 * @module nag
 */

export type { MoveClassification } from './nag-validator.js';

export {
  VALID_NAGS,
  MOVE_QUALITY_NAGS,
  POSITION_NAGS,
  isValidNag,
  normalizeNag,
  classificationToNag,
  filterValidNags,
  getNagDescription,
  getNagSymbol,
  evalToPositionNag,
} from './nag-validator.js';
