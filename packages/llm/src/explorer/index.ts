/**
 * Exploration module
 *
 * Engine-driven variation exploration for the Ultra-Fast Coach pipeline.
 */

// Shared exploration types
export {
  type EngineEvaluation,
  type EngineService,
  type MaiaService,
  type ExploredLine,
  type LinePurpose,
  type LineSource,
} from './types.js';

// Engine-driven explorer (Ultra-Fast Coach architecture)
export {
  EngineDrivenExplorer,
  createEngineDrivenExplorer,
  type EngineDrivenExplorerConfig,
  type EngineDrivenExplorerProgress,
  type EngineDrivenExplorerResult,
  type ThemeVerbosity,
} from './engine-driven-explorer.js';
