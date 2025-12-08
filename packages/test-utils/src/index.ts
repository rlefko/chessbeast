/**
 * @chessbeast/test-utils
 *
 * Shared test utilities for ChessBeast testing infrastructure
 */

// Fixture loading
export {
  loadPgn,
  loadPgnSync,
  loadJson,
  loadJsonSync,
  getFixturePath,
  listPgnFixtures,
  fixtureExists,
} from './fixtures/loader.js';

// Mock services
export {
  createMockEngine,
  DEFAULT_ENGINE_EVAL,
  type MockEngine,
  type MockEngineConfig,
} from './mocks/mock-engine.js';

export {
  createMockMaia,
  DEFAULT_MAIA_PREDICTION,
  type MockMaia,
  type MockMaiaConfig,
} from './mocks/mock-maia.js';

export {
  createMockAnnotator,
  type MockAnnotator,
  type MockLlmConfig,
  type AnnotationResult,
} from './mocks/mock-llm.js';

export {
  createMockServices,
  createDeterministicMocks,
  createMockEcoClient,
  createMockLichessClient,
  createNullReporter,
  createTrackingReporter,
  type MockServices,
  type MockServicesConfig,
} from './mocks/mock-services.js';

// Builders
export { GameAnalysisBuilder, gameAnalysis } from './builders/game-analysis-builder.js';

export {
  MoveAnalysisBuilder,
  moveAnalysis,
  createMoveSequence,
} from './builders/move-analysis-builder.js';

export {
  ConfigBuilder,
  config,
  configPresets,
  type AnalysisSpeed,
  type ThemeVerbosity,
  type VariationDepth,
  type CommentDensity,
  type AudienceLevel,
  type UltraFastCoachConfigSchema,
  type ChessBeastConfig,
} from './builders/config-builder.js';

// Semantic matching
export {
  CHESS_SYNONYMS,
  normalizeText,
  matchesTheme,
  calculateThemeMatchRatio,
  getThemeMatches,
  assertSemanticSimilarity,
  expectSemanticMatch,
  isAnnotationCoherent,
  extractMoveReferences,
} from './assertions/semantic-matcher.js';

// Analysis assertions
export {
  assertCriticalMomentCount,
  assertCriticalMomentsAt,
  assertBlunderCount,
  assertMoveClassifications,
  assertAccuracy,
  assertOpening,
  assertAnnotationsOnCriticalMoments,
  assertHasSummary,
  assertTotalMoves,
  assertTotalPlies,
  assertValidAnalysis,
} from './assertions/analysis-assertions.js';

// Annotation assertions
export {
  assertAnnotationGrammar,
  assertAllAnnotationsGrammar,
  assertValidMoveReferences,
  assertAnnotationThemes,
  assertAnnotationContains,
  assertCriticalMomentAnnotationRelevance,
  assertNagsMatchClassifications,
  assertHasAnnotation,
  assertSummaryThemes,
  assertSummaryMentionsPlayers,
  assertAnnotationCount,
} from './assertions/annotation-assertions.js';

// Metrics collection
export {
  MetricsCollector,
  createMetricsCollector,
  type QualityMetrics,
  type BlunderDetectionMetrics,
  type ClassificationAccuracy,
  type OpeningIdentificationMetrics,
  type AnnotationCoherenceMetrics,
} from './reporters/metrics-collector.js';

// Performance benchmarking
export {
  BenchmarkRunner,
  createBenchmarkRunner,
  PROFILE_TIME_BUDGETS,
  getExpectedMaxTime,
  type AnalysisTimings,
  type ResourceMetrics,
  type BenchmarkResult,
  type BenchmarkSummary,
  type BenchmarkReport,
} from './reporters/performance-reporter.js';
