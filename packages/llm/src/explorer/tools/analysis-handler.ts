/**
 * Analysis Tool Handler
 *
 * Handles on-demand analysis tools for the variation tree.
 * Tools: analyze_themes
 */

import {
  TacticalThemeDetector,
  PositionalThemeDetector,
  generateThemeSummary,
  type DetectedTheme,
} from '@chessbeast/core';
import { ChessPosition } from '@chessbeast/pgn';

import type { ToolCall } from '../../tools/types.js';

import type { ToolExecutionContext, ToolHandler } from './tool-router.js';

/**
 * Handler for analysis tools
 */
export class AnalysisToolHandler implements ToolHandler {
  readonly toolNames = ['analyze_themes'] as const;

  private readonly tacticalDetector = new TacticalThemeDetector();
  private readonly positionalDetector = new PositionalThemeDetector();

  async execute(
    _toolCall: ToolCall,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    const { tree } = context;
    const toolName = _toolCall.function.name;

    switch (toolName) {
      case 'analyze_themes': {
        const focus = (args.focus as string) || 'all';
        const fen = tree.getCurrentNode().fen;
        const pos = new ChessPosition(fen);

        // Detect themes at full depth
        let tactical: DetectedTheme[] = [];
        let positional: DetectedTheme[] = [];

        if (focus === 'all' || focus === 'tactical') {
          tactical = this.tacticalDetector.detect(pos, { tier: 'full' });
        }

        if (focus === 'all' || focus === 'positional') {
          positional = this.positionalDetector.detect(pos, { tier: 'full' });
        }

        // Generate summary
        const summary = generateThemeSummary(tactical, positional);

        // Format tactical themes for response
        const tacticalFormatted = tactical.map((t) => ({
          id: t.id,
          confidence: t.confidence,
          severity: t.severity,
          squares: t.squares,
          pieces: t.pieces,
          explanation: t.explanation,
          beneficiary: t.beneficiary === 'w' ? 'white' : 'black',
          materialAtStake: t.materialAtStake,
        }));

        // Format positional themes for response
        const positionalFormatted = positional.map((t) => ({
          id: t.id,
          confidence: t.confidence,
          severity: t.severity,
          squares: t.squares,
          explanation: t.explanation,
          beneficiary: t.beneficiary === 'w' ? 'white' : 'black',
        }));

        return {
          success: true,
          fen,
          tactical: tacticalFormatted,
          positional: positionalFormatted,
          summary,
          counts: {
            tactical: tactical.length,
            positional: positional.length,
          },
        };
      }

      default:
        return { success: false, error: `Unknown analysis tool: ${toolName}` };
    }
  }
}
