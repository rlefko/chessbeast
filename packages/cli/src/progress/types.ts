/**
 * Shared types for progress reporter components
 */

/**
 * Color function type for conditional colorization
 */
export type ColorFn = (text: string) => string;

/**
 * Color functions bundle
 */
export interface ColorFunctions {
  bold: ColorFn;
  dim: ColorFn;
  green: ColorFn;
  red: ColorFn;
  yellow: ColorFn;
  cyan: ColorFn;
}

/**
 * Analysis phases
 */
export type AnalysisPhase =
  | 'initializing'
  | 'parsing'
  | 'shallow_analysis'
  | 'classification'
  | 'critical_detection'
  | 'deep_analysis'
  | 'maia_analysis'
  | 'llm_annotation'
  | 'agentic_annotation'
  | 'rendering'
  | 'complete';

/**
 * Phase display names
 */
export const PHASE_NAMES: Record<AnalysisPhase, string> = {
  initializing: 'Checking services',
  parsing: 'Parsing PGN',
  shallow_analysis: 'Shallow analysis',
  classification: 'Classification',
  critical_detection: 'Finding critical moments',
  deep_analysis: 'Deep analysis',
  maia_analysis: 'Maia analysis',
  llm_annotation: 'LLM annotation',
  agentic_annotation: 'Agentic annotation',
  rendering: 'Rendering output',
  complete: 'Complete',
};

/**
 * Service health status
 */
export interface ServiceStatus {
  name: string;
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Progress reporter options
 */
export interface ProgressReporterOptions {
  /** Suppress all output */
  silent?: boolean;
  /** Enable colored output (default: true) */
  color?: boolean;
  /** Enable verbose output including reasoning thoughts (default: false) */
  verbose?: boolean;
  /** Enable detailed debug output with full LLM reasoning and tool call details (default: false) */
  debug?: boolean;
}
