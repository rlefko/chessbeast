/**
 * Centralized theme for the Debug GUI.
 *
 * All panels import colors and icons from here so classification, evaluation,
 * lifecycle, and intent styling stay consistent across the interface.
 */

/**
 * Shared palette used across panels
 */
export const palette = {
  panelBorderFocused: 'cyan',
  panelBorder: 'gray',
  panelTitleFocused: 'cyanBright',
  panelTitle: 'white',

  accent: 'cyan',
  accentBright: 'cyanBright',
  success: 'green',
  successBright: 'greenBright',
  warning: 'yellow',
  warningBright: 'yellowBright',
  danger: 'red',
  dangerBright: 'redBright',
  neutral: 'white',
  muted: 'gray',

  thinking: 'gray',
  comment: 'green',
  cost: 'yellow',
} as const;

/**
 * Color for a move classification (brilliant/good/mistake/blunder/...)
 */
export function getClassificationColor(classification?: string | undefined): string {
  switch (classification) {
    case 'brilliant':
      return palette.accentBright;
    case 'great':
    case 'best':
      return palette.successBright;
    case 'good':
      return palette.success;
    case 'book':
    case 'normal':
      return palette.neutral;
    case 'inaccuracy':
      return palette.warning;
    case 'mistake':
      return palette.danger;
    case 'blunder':
      return palette.dangerBright;
    default:
      return palette.muted;
  }
}

/**
 * Color for an engine evaluation (positive = white advantage)
 */
export function getEvalColor(evaluation?: {
  cp?: number | undefined;
  mate?: number | undefined;
}): string {
  if (!evaluation) return palette.muted;

  const { cp, mate } = evaluation;

  if (mate !== undefined) {
    return mate > 0 ? palette.successBright : palette.dangerBright;
  }

  if (cp !== undefined) {
    const absCp = Math.abs(cp);
    if (absCp < 25) return palette.neutral;
    if (absCp < 150) return cp > 0 ? palette.success : palette.danger;
    return cp > 0 ? palette.successBright : palette.dangerBright;
  }

  return palette.muted;
}

/**
 * Color for a theme lifecycle status
 */
export function getLifecycleColor(lifecycle: string): string {
  switch (lifecycle) {
    case 'emerged':
      return palette.successBright;
    case 'persisting':
      return palette.accent;
    case 'escalated':
      return palette.warningBright;
    case 'resolved':
      return palette.muted;
    default:
      return palette.neutral;
  }
}

/**
 * Icon for a theme lifecycle status
 */
export function getLifecycleIcon(lifecycle: string): string {
  switch (lifecycle) {
    case 'emerged':
      return '[NEW]';
    case 'persisting':
      return '[+]';
    case 'escalated':
      return '[!]';
    case 'resolved':
      return '[-]';
    default:
      return '[?]';
  }
}

/**
 * Icon for a comment intent type (annotation queue rows)
 */
export function getIntentIcon(intentType: string): string {
  switch (intentType) {
    case 'blunder_explanation':
      return '??';
    case 'what_was_missed':
      return '?';
    case 'tactical_shot':
      return '!!';
    case 'why_this_move':
      return '!';
    case 'strategic_plan':
      return '=';
    case 'endgame_technique':
      return 'K';
    case 'human_move':
      return 'H';
    case 'theme_emergence':
      return 'T+';
    case 'theme_resolution':
      return 'T-';
    case 'critical_moment':
      return '*';
    default:
      return '.';
  }
}

/**
 * Color for a comment intent type
 */
export function getIntentColor(intentType: string): string {
  switch (intentType) {
    case 'blunder_explanation':
      return palette.dangerBright;
    case 'what_was_missed':
      return palette.danger;
    case 'tactical_shot':
      return palette.accentBright;
    case 'why_this_move':
      return palette.success;
    case 'critical_moment':
      return palette.warningBright;
    case 'theme_emergence':
    case 'theme_resolution':
      return palette.accent;
    default:
      return palette.neutral;
  }
}

/**
 * Color for an annotation item status
 */
export function getAnnotationStatusColor(status: 'pending' | 'done' | 'filtered'): string {
  switch (status) {
    case 'pending':
      return palette.warning;
    case 'done':
      return palette.success;
    case 'filtered':
      return palette.muted;
  }
}

/**
 * Icon for an annotation item status
 */
export function getAnnotationStatusIcon(status: 'pending' | 'done' | 'filtered'): string {
  switch (status) {
    case 'pending':
      return '○';
    case 'done':
      return '✓';
    case 'filtered':
      return '✗';
  }
}
