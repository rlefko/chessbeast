/**
 * @chessbeast/llm - LLM annotation generation for chess games
 *
 * Implements the Ultra-Fast Coach architecture: engine-driven exploration
 * (priority-queue search with theme detection) followed by post-write LLM
 * narration. It includes:
 * - OpenAI client with retry logic and circuit breaker
 * - Theme detection with lifecycle tracking
 * - Comment intents filtered by density and redundancy
 * - Narrator and game summary with deterministic template fallbacks
 */

// Configuration
export type {
  LLMConfig,
  LLMConfigInput,
  TokenBudget,
  RetryConfig,
  ReasoningEffort,
} from './config/llm-config.js';
export { createLLMConfig, loadConfigFromEnv, DEFAULT_LLM_CONFIG } from './config/llm-config.js';

// LLM client
export type { HealthStatus, TokenUsage, CircuitState, StreamChunk } from './client/types.js';
export { OpenAIClient, TokenTracker } from './client/openai-client.js';
export { CircuitBreaker } from './client/circuit-breaker.js';

export * from './errors.js';

// Exploration types (consumed by the CLI orchestrator adapters)
export {
  type EngineEvaluation,
  type EngineService,
  type MaiaService,
  type ExploredLine,
  type LinePurpose,
  type LineSource,
} from './explorer/index.js';

// Model pricing
export {
  getModelPricing,
  calculateCost,
  MODEL_PRICING,
  DEFAULT_PRICING,
  type ModelPricing,
} from './cost/index.js';

// Memory - Line context tracking and redundancy prevention
export {
  // Line Memory
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
  // Idea Tracker
  type IdeaScope,
  type TrackedIdea,
  type IdeaTrackerConfig,
  type RedundancyCheck,
  DEFAULT_IDEA_TRACKER_CONFIG,
  IdeaTracker,
  createIdeaTracker,
  calculateRedundancyPenalty,
} from './memory/index.js';

// Narration - Post-write comment synthesis
export {
  // Intent types and generation
  type CommentIntentType,
  type IntentContent,
  type IntentScoreBreakdown,
  type CommentIntent,
  type IntentGeneratorConfig,
  type IntentInput,
  INTENT_SCORE_WEIGHTS,
  DEFAULT_INTENT_CONFIG,
  determineIntentType,
  calculateInstructionalValue,
  calculateIntentRedundancyPenalty,
  calculateThemeNovelty,
  calculateIntentScore,
  extractIdeaKeys,
  determineSuggestedLength,
  isMandatoryIntent,
  createCommentIntent,
  sortIntentsByPriority,
  getIntentTypeDescription,
  // Density control
  type DensityLevel,
  type DensityConfig,
  type DensityFilterResult,
  DENSITY_CONFIGS,
  DensityFilter,
  createDensityFilter,
  calculateIdealPositions,
  compressAdjacentIntents,
  selectRepresentativeIntent,
  shouldBypassDensity,
  recommendDensityLevel,
  // Redundancy detection
  type RedundancyFilterConfig,
  type RedundancyFilterResult,
  type RedundancyReason,
  type IntentRedundancyAnalysis,
  DEFAULT_REDUNDANCY_CONFIG,
  RedundancyFilter,
  createRedundancyFilter,
  isIdeaRedundant,
  calculateBatchRedundancy,
  findFreshestIdeas,
  mergeRedundancyResults,
  // Narrator
  type AudienceLevel,
  type AnnotationPerspective,
  type NarratorConfig,
  type GeneratedNarration,
  type NarrationResult,
  type NarratorInput,
  DEFAULT_NARRATOR_CONFIG,
  Narrator,
  createNarrator,
  narrateIntents,
  // Game summary
  type GameSummaryConfig,
  DEFAULT_GAME_SUMMARY_CONFIG,
  generateGameSummary,
  buildTemplateSummary,
} from './narration/index.js';

// Theme Detection
export {
  // Types
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
  // Detector interface
  type DetectorPosition,
  type DetectorContext,
  type DetectorResult,
  type ThemeDetector,
  BaseThemeDetector,
  DetectorRegistry,
  createDetectorRegistry,
  // Lifecycle tracking
  type LifecycleTrackerConfig,
  DEFAULT_LIFECYCLE_CONFIG,
  ThemeLifecycleTracker,
  createLifecycleTracker,
  filterSignificantDeltas,
  getNovelThemes,
  sortThemesByImportance,
  // Detectors
  PinDetector,
  createPinDetector,
  ForkDetector,
  createForkDetector,
  createFullDetectorRegistry,
  createTacticalDetectorRegistry,
} from './themes/index.js';

// Engine-Driven Explorer (Ultra-Fast Coach architecture)
export {
  EngineDrivenExplorer,
  createEngineDrivenExplorer,
  type EngineDrivenExplorerConfig,
  type EngineDrivenExplorerProgress,
  type EngineDrivenExplorerResult,
  type ThemeVerbosity,
} from './explorer/index.js';

// Annotation Pipeline (Ultra-Fast Coach architecture)
export {
  PostWritePipeline,
  createPostWritePipeline,
  annotateWithPostWrite,
  type PostWritePipelineConfig,
  type PostWritePipelineProgress,
  type PostWritePipelineInput,
  type PostWritePipelineResult,
} from './annotation/index.js';
