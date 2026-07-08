/**
 * Resolved default-configuration pin
 *
 * Pins the complete resolved DEFAULT_CONFIG (and the key lines of its
 * formatConfig rendering) so any accidental change to a shipped default
 * fails loudly in CI instead of silently altering analysis behavior.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults.js';
import { formatConfig } from '../config/loader.js';

describe('resolved default configuration', () => {
  it('pins the complete DEFAULT_CONFIG object', () => {
    expect(DEFAULT_CONFIG).toEqual({
      analysis: {
        profile: 'standard',
        shallowDepth: 14,
        shallowTimeLimitMs: 3000,
        deepDepth: 22,
        deepTimeLimitMs: 10000,
        multiPvCount: 3,
        maxCriticalRatio: 0.25,
        mateMinTimeMs: 5000,
        skipMaia: false,
        skipLlm: false,
      },
      ratings: {
        defaultRating: 1500,
      },
      llm: {
        model: 'gpt-5-mini',
        temperature: 0.7,
        timeout: 30000,
        reasoningEffort: 'medium',
        streaming: true,
      },
      services: {
        stockfish: {
          host: 'localhost',
          port: 50051,
          timeoutMs: 300000,
        },
        maia: {
          host: 'localhost',
          port: 50052,
          timeoutMs: 30000,
        },
      },
      databases: {
        ecoPath: 'data/eco.db',
        lichessPath: 'data/lichess_elite.db',
      },
      output: {
        includeVariations: true,
        includeNags: true,
        includeSummary: true,
        perspective: 'neutral',
      },
      ultraFastCoach: {
        speed: 'normal',
        themes: 'important',
        variations: 'medium',
        commentDensity: 'normal',
        audience: 'club',
      },
    });
  });

  it('renders the key default lines through formatConfig', () => {
    const formatted = formatConfig(DEFAULT_CONFIG);

    expect(formatted).toContain('"model": "gpt-5-mini"');
    expect(formatted).toContain('"profile": "standard"');
    expect(formatted).toContain('"speed": "normal"');
    expect(formatted).toContain('"audience": "club"');
    expect(formatted).toContain('"commentDensity": "normal"');
    expect(formatted).toContain('"perspective": "neutral"');
    expect(formatted).toContain('"includeSummary": true');
  });
});
