/**
 * NAG (Numeric Annotation Glyph) validation
 *
 * Re-exports from @chessbeast/pgn where NAG utilities are canonically defined.
 * This file exists for backwards compatibility.
 */

export {
  VALID_NAGS,
  MOVE_QUALITY_NAGS,
  isValidNag,
  normalizeNag,
  classificationToNag,
  filterValidNags,
  getNagDescription,
  getNagSymbol,
} from '@chessbeast/pgn';
