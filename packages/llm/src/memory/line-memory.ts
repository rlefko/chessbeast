/**
 * Line Memory
 *
 * Tracks context for a single line of analysis including:
 * - Rolling summary of key events
 * - Active themes and explained concepts
 * - Eval trend history
 * - Narrative focus for coherent commentary
 */

import type { IdeaKey } from '../themes/idea-keys.js';
import { IdeaKeySet, createIdeaKeySet, generateThemeIdeaKey } from '../themes/idea-keys.js';
import type { ThemeInstance } from '../themes/types.js';

/**
 * Eval history entry
 */
export interface EvalEntry {
  /** Ply number */
  ply: number;
  /** Centipawn evaluation */
  cp: number;
  /** Mate score if applicable */
  mate?: number;
}

/**
 * Summary entry for rolling summary
 */
export interface SummaryEntry {
  /** Ply when this summary was added */
  ply: number;
  /** Summary text */
  text: string;
  /** Type of summary */
  type: 'eval_swing' | 'theme_emerged' | 'structural_change' | 'plan_shift' | 'other';
  /** Priority for pruning (higher = more important to keep) */
  priority: number;
}

/**
 * Line memory configuration
 */
export interface LineMemoryConfig {
  /** Maximum number of summary entries (default: 15) */
  maxSummaryEntries: number;
  /** Minimum entries to keep (default: 5) */
  minSummaryEntries: number;
  /** Eval swing threshold to add summary (default: 80cp) */
  evalSwingThreshold: number;
  /** Maximum eval history length (default: 100) */
  maxEvalHistory: number;
}

/**
 * Default line memory configuration
 */
export const DEFAULT_LINE_MEMORY_CONFIG: LineMemoryConfig = {
  maxSummaryEntries: 15,
  minSummaryEntries: 5,
  evalSwingThreshold: 80,
  maxEvalHistory: 100,
};

/**
 * Line memory state
 *
 * Tracks all context for a single line of analysis.
 */
export interface LineMemory {
  /** Unique identifier for this line */
  lineId: string;

  /** Current node ID in the variation tree */
  currentNodeId: string;

  /** Current FEN position */
  currentFen: string;

  /** Current ply number */
  currentPly: number;

  /** Rolling summary of important events (5-15 entries) */
  rollingSummary: SummaryEntry[];

  /** Currently active themes */
  activeThemes: ThemeInstance[];

  /** Theme keys that have been explained */
  explainedThemeKeys: IdeaKeySet;

  /** General concept keys that have been explained */
  explainedConceptKeys: IdeaKeySet;

  /** Explored idea keys for redundancy prevention */
  exploredIdeaKeys: IdeaKeySet;

  /** Evaluation trend history */
  evalTrend: EvalEntry[];

  /** Current narrative focus (e.g., "kingside attack", "endgame conversion") */
  narrativeFocus?: string;

  /** Parent line ID (for branching) */
  parentLineId?: string;

  /** Branching ply (when this line diverged from parent) */
  branchPly?: number;
}

/**
 * Create a new line memory
 */
export function createLineMemory(
  lineId: string,
  rootFen: string,
  rootNodeId: string,
  options?: {
    parentLineId?: string;
    branchPly?: number;
    initialPly?: number;
  },
): LineMemory {
  const memory: LineMemory = {
    lineId,
    currentNodeId: rootNodeId,
    currentFen: rootFen,
    currentPly: options?.initialPly ?? 0,
    rollingSummary: [],
    activeThemes: [],
    explainedThemeKeys: createIdeaKeySet(),
    explainedConceptKeys: createIdeaKeySet(),
    exploredIdeaKeys: createIdeaKeySet(),
    evalTrend: [],
  };

  if (options?.parentLineId !== undefined) {
    memory.parentLineId = options.parentLineId;
  }
  if (options?.branchPly !== undefined) {
    memory.branchPly = options.branchPly;
  }

  return memory;
}

/**
 * Update line memory with a new position
 */
export function updateLinePosition(
  memory: LineMemory,
  nodeId: string,
  fen: string,
  ply: number,
): void {
  memory.currentNodeId = nodeId;
  memory.currentFen = fen;
  memory.currentPly = ply;
}

/**
 * Add an eval entry to the trend
 */
export function addEvalToMemory(
  memory: LineMemory,
  entry: EvalEntry,
  config: LineMemoryConfig = DEFAULT_LINE_MEMORY_CONFIG,
): void {
  memory.evalTrend.push(entry);

  // Trim if too long
  if (memory.evalTrend.length > config.maxEvalHistory) {
    memory.evalTrend = memory.evalTrend.slice(-config.maxEvalHistory);
  }
}

/**
 * Add a summary entry
 */
export function addSummaryEntry(
  memory: LineMemory,
  entry: Omit<SummaryEntry, 'ply'>,
  config: LineMemoryConfig = DEFAULT_LINE_MEMORY_CONFIG,
): void {
  const fullEntry: SummaryEntry = {
    ...entry,
    ply: memory.currentPly,
  };

  memory.rollingSummary.push(fullEntry);

  // Prune if too many entries
  if (memory.rollingSummary.length > config.maxSummaryEntries) {
    pruneSummary(memory, config);
  }
}

/**
 * Prune summary to max entries, keeping highest priority
 */
function pruneSummary(memory: LineMemory, config: LineMemoryConfig): void {
  if (memory.rollingSummary.length <= config.maxSummaryEntries) {
    return;
  }

  // Sort by priority (descending) then by ply (most recent first)
  const sorted = [...memory.rollingSummary].sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return b.ply - a.ply;
  });

  // Keep top entries
  memory.rollingSummary = sorted.slice(0, config.maxSummaryEntries);

  // Re-sort by ply for chronological order
  memory.rollingSummary.sort((a, b) => a.ply - b.ply);
}

/**
 * Update active themes
 */
export function updateActiveThemes(memory: LineMemory, themes: ThemeInstance[]): void {
  memory.activeThemes = themes;
}

/**
 * Mark themes as explained
 */
export function markThemesExplained(memory: LineMemory, themes: ThemeInstance[]): void {
  for (const theme of themes) {
    const ideaKey = generateThemeIdeaKey(theme);
    memory.explainedThemeKeys.add(ideaKey);
  }
}

/**
 * Mark a concept as explained
 */
export function markConceptExplained(memory: LineMemory, ideaKey: IdeaKey): void {
  memory.explainedConceptKeys.add(ideaKey);
}

/**
 * Mark an idea as explored (for redundancy prevention)
 */
export function markIdeaExplored(memory: LineMemory, ideaKey: IdeaKey): void {
  memory.exploredIdeaKeys.add(ideaKey);
}

/**
 * Check if a theme has been explained
 */
export function isThemeExplained(memory: LineMemory, theme: ThemeInstance): boolean {
  const ideaKey = generateThemeIdeaKey(theme);
  return memory.explainedThemeKeys.has(ideaKey);
}

/**
 * Check if a concept has been explained
 */
export function isConceptExplained(memory: LineMemory, ideaKey: IdeaKey): boolean {
  return memory.explainedConceptKeys.has(ideaKey);
}

/**
 * Check if an idea has been explored
 */
export function isIdeaExplored(memory: LineMemory, ideaKey: IdeaKey): boolean {
  return memory.exploredIdeaKeys.has(ideaKey);
}

/**
 * Set narrative focus
 */
export function setNarrativeFocus(memory: LineMemory, focus: string): void {
  memory.narrativeFocus = focus;
}

/**
 * Get recent eval trend
 */
export function getRecentEvalTrend(memory: LineMemory, count: number = 10): EvalEntry[] {
  return memory.evalTrend.slice(-count);
}

/**
 * Calculate eval trend direction
 */
export function getEvalTrendDirection(memory: LineMemory): 'improving' | 'declining' | 'stable' {
  if (memory.evalTrend.length < 3) {
    return 'stable';
  }

  const recent = memory.evalTrend.slice(-5);
  const first = recent[0]!.cp;
  const last = recent[recent.length - 1]!.cp;
  const diff = last - first;

  if (diff > 50) return 'improving';
  if (diff < -50) return 'declining';
  return 'stable';
}

/**
 * Detect significant eval swing from recent history
 */
export function detectEvalSwing(
  memory: LineMemory,
  threshold: number = DEFAULT_LINE_MEMORY_CONFIG.evalSwingThreshold,
): { hasSwing: boolean; amount: number } {
  if (memory.evalTrend.length < 2) {
    return { hasSwing: false, amount: 0 };
  }

  const current = memory.evalTrend[memory.evalTrend.length - 1]!;
  const previous = memory.evalTrend[memory.evalTrend.length - 2]!;
  const amount = Math.abs(current.cp - previous.cp);

  return {
    hasSwing: amount >= threshold,
    amount,
  };
}

/**
 * Get unexplained themes (themes that are active but not yet explained)
 */
export function getUnexplainedThemes(memory: LineMemory): ThemeInstance[] {
  return memory.activeThemes.filter((theme) => !isThemeExplained(memory, theme));
}

/**
 * Get summary text as bullet points
 */
export function getSummaryBullets(memory: LineMemory): string[] {
  return memory.rollingSummary.map((entry) => entry.text);
}

/**
 * Clone line memory for branching
 */
export function cloneLineMemory(
  memory: LineMemory,
  newLineId: string,
  branchPly: number,
): LineMemory {
  const cloned = createLineMemory(newLineId, memory.currentFen, memory.currentNodeId, {
    parentLineId: memory.lineId,
    branchPly,
    initialPly: memory.currentPly,
  });

  // Copy summary entries
  cloned.rollingSummary = [...memory.rollingSummary];

  // Copy active themes
  cloned.activeThemes = [...memory.activeThemes];

  // Clone idea key sets
  cloned.explainedThemeKeys.import(memory.explainedThemeKeys.export());
  cloned.explainedConceptKeys.import(memory.explainedConceptKeys.export());
  cloned.exploredIdeaKeys.import(memory.exploredIdeaKeys.export());

  // Copy eval trend
  cloned.evalTrend = [...memory.evalTrend];

  // Copy narrative focus
  if (memory.narrativeFocus !== undefined) {
    cloned.narrativeFocus = memory.narrativeFocus;
  }

  return cloned;
}

/**
 * Serialize line memory for storage
 */
export function serializeLineMemory(memory: LineMemory): string {
  return JSON.stringify({
    lineId: memory.lineId,
    currentNodeId: memory.currentNodeId,
    currentFen: memory.currentFen,
    currentPly: memory.currentPly,
    rollingSummary: memory.rollingSummary,
    activeThemes: memory.activeThemes,
    explainedThemeKeys: memory.explainedThemeKeys.export(),
    explainedConceptKeys: memory.explainedConceptKeys.export(),
    exploredIdeaKeys: memory.exploredIdeaKeys.export(),
    evalTrend: memory.evalTrend,
    narrativeFocus: memory.narrativeFocus,
    parentLineId: memory.parentLineId,
    branchPly: memory.branchPly,
  });
}

/**
 * Deserialize line memory from storage
 */
export function deserializeLineMemory(json: string): LineMemory {
  const data = JSON.parse(json) as {
    lineId: string;
    currentNodeId: string;
    currentFen: string;
    currentPly: number;
    rollingSummary: SummaryEntry[];
    activeThemes: ThemeInstance[];
    explainedThemeKeys: string[];
    explainedConceptKeys: string[];
    exploredIdeaKeys: string[];
    evalTrend: EvalEntry[];
    narrativeFocus?: string;
    parentLineId?: string;
    branchPly?: number;
  };

  // Build options without explicit undefined values (exactOptionalPropertyTypes)
  const options: {
    parentLineId?: string;
    branchPly?: number;
    initialPly?: number;
  } = {
    initialPly: data.currentPly,
  };
  if (data.parentLineId !== undefined) {
    options.parentLineId = data.parentLineId;
  }
  if (data.branchPly !== undefined) {
    options.branchPly = data.branchPly;
  }

  const memory = createLineMemory(data.lineId, data.currentFen, data.currentNodeId, options);

  memory.rollingSummary = data.rollingSummary;
  memory.activeThemes = data.activeThemes;
  memory.explainedThemeKeys.import(data.explainedThemeKeys);
  memory.explainedConceptKeys.import(data.explainedConceptKeys);
  memory.exploredIdeaKeys.import(data.exploredIdeaKeys);
  memory.evalTrend = data.evalTrend;

  if (data.narrativeFocus !== undefined) {
    memory.narrativeFocus = data.narrativeFocus;
  }

  return memory;
}
