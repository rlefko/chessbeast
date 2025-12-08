/**
 * Memory Module
 *
 * Provides context tracking for chess analysis lines including:
 * - Line memory for tracking position-by-position context
 * - Rolling summaries for key events
 * - Idea tracking for redundancy prevention
 */

// Line Memory
export {
  type EvalEntry,
  type SummaryEntry,
  type LineMemoryConfig,
  type LineMemory,
  DEFAULT_LINE_MEMORY_CONFIG,
  createLineMemory,
  updateLinePosition,
  addEvalToMemory,
  addSummaryEntry,
  updateActiveThemes,
  markThemesExplained,
  markConceptExplained,
  markIdeaExplored,
  isThemeExplained,
  isConceptExplained,
  isIdeaExplored,
  setNarrativeFocus,
  getRecentEvalTrend,
  getEvalTrendDirection,
  detectEvalSwing,
  getUnexplainedThemes,
  getSummaryBullets,
  cloneLineMemory,
  serializeLineMemory,
  deserializeLineMemory,
} from './line-memory.js';

// Rolling Summary
export {
  SUMMARY_PRIORITIES,
  createEvalSwingSummary,
  createThemeEmergenceSummary,
  createThemeResolutionSummary,
  createStructuralChangeSummary,
  createPlanShiftSummary,
  createGeneralSummary,
  shouldAddEvalSwingSummary,
  shouldAddThemeSummary,
  processThemeDeltasForSummary,
  compressSummary,
  formatSummary,
  getSummaryByType,
  getLatestSummary,
  clearSummaryBefore,
} from './rolling-summary.js';

// Idea Tracker
export {
  type IdeaScope,
  type TrackedIdea,
  type IdeaTrackerConfig,
  type RedundancyCheck,
  DEFAULT_IDEA_TRACKER_CONFIG,
  IdeaTracker,
  createIdeaTracker,
  calculateRedundancyPenalty,
} from './idea-tracker.js';
