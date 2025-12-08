/**
 * Theme Detection Module
 *
 * Comprehensive theme detection system with lifecycle tracking.
 * Detects tactical, structural, positional, and dynamic themes.
 */

// Core types
export {
  type ThemeStatus,
  type ThemeInstance,
  type ThemeDelta,
  type ThemeSummary,
  generateThemeKey,
  calculateNoveltyScore,
  createThemeInstance,
  createThemeDelta,
  createEmptyThemeSummary,
  buildThemeSummary,
} from './types.js';

// Detector interface and base class
export {
  type DetectorPosition,
  type DetectorContext,
  type DetectorResult,
  type ThemeDetector,
  BaseThemeDetector,
  DetectorRegistry,
  createDetectorRegistry,
} from './detector-interface.js';

// Lifecycle tracking
export {
  type LifecycleTrackerConfig,
  DEFAULT_LIFECYCLE_CONFIG,
  ThemeLifecycleTracker,
  createLifecycleTracker,
  filterSignificantDeltas,
  getNovelThemes,
  sortThemesByImportance,
} from './lifecycle.js';

// Idea keys for redundancy detection
export {
  type IdeaKeyType,
  type IdeaKey,
  generateThemeIdeaKey,
  generateTacticIdeaKey,
  generatePlanIdeaKey,
  generateWeaknessIdeaKey,
  generateStructureIdeaKey,
  generatePiecePlacementIdeaKey,
  generateOpeningIdeaKey,
  generateEndgameIdeaKey,
  IdeaKeySet,
  createIdeaKeySet,
  isThemeRedundant,
  filterNonRedundantThemes,
  getConceptName,
  getConceptGroup,
} from './idea-keys.js';

// Detectors
export {
  PinDetector,
  createPinDetector,
  ForkDetector,
  createForkDetector,
  createFullDetectorRegistry,
  createTacticalDetectorRegistry,
} from './detectors/index.js';
