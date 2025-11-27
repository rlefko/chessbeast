/**
 * CLI options parsing tests
 */

import { describe, it, expect } from 'vitest';

import { parseCliOptions } from '../cli.js';

describe('parseCliOptions', () => {
  describe('basic options', () => {
    it('should parse input option', () => {
      const result = parseCliOptions({ input: 'game.pgn' });
      expect(result.input).toBe('game.pgn');
    });

    it('should parse output option', () => {
      const result = parseCliOptions({ output: 'annotated.pgn' });
      expect(result.output).toBe('annotated.pgn');
    });

    it('should parse config option', () => {
      const result = parseCliOptions({ config: './my-config.json' });
      expect(result.config).toBe('./my-config.json');
    });
  });

  describe('profile and verbosity', () => {
    it('should parse profile option', () => {
      expect(parseCliOptions({ profile: 'quick' }).profile).toBe('quick');
      expect(parseCliOptions({ profile: 'standard' }).profile).toBe('standard');
      expect(parseCliOptions({ profile: 'deep' }).profile).toBe('deep');
    });

    it('should parse verbosity option', () => {
      expect(parseCliOptions({ verbosity: 'summary' }).verbosity).toBe('summary');
      expect(parseCliOptions({ verbosity: 'normal' }).verbosity).toBe('normal');
      expect(parseCliOptions({ verbosity: 'rich' }).verbosity).toBe('rich');
    });
  });

  describe('target elo', () => {
    it('should parse target elo as number', () => {
      const result = parseCliOptions({ targetElo: 1500 });
      expect(result.targetElo).toBe(1500);
    });
  });

  describe('skip flags', () => {
    it('should parse skipMaia flag', () => {
      expect(parseCliOptions({ skipMaia: true }).skipMaia).toBe(true);
      expect(parseCliOptions({ skipMaia: false }).skipMaia).toBe(false);
    });

    it('should parse skipLlm flag', () => {
      expect(parseCliOptions({ skipLlm: true }).skipLlm).toBe(true);
      expect(parseCliOptions({ skipLlm: false }).skipLlm).toBe(false);
    });
  });

  describe('showConfig flag', () => {
    it('should parse showConfig flag', () => {
      expect(parseCliOptions({ showConfig: true }).showConfig).toBe(true);
      expect(parseCliOptions({ showConfig: false }).showConfig).toBe(false);
    });
  });

  describe('new CLI options', () => {
    it('should parse noColor when color is false (Commander.js negated flag)', () => {
      // Commander.js converts --no-color to color: false
      const result = parseCliOptions({ color: false });
      expect(result.noColor).toBe(true);
    });

    it('should not set noColor when color is true', () => {
      const result = parseCliOptions({ color: true });
      expect(result.noColor).toBeUndefined();
    });

    it('should parse dryRun flag', () => {
      expect(parseCliOptions({ dryRun: true }).dryRun).toBe(true);
      expect(parseCliOptions({ dryRun: false }).dryRun).toBe(false);
    });
  });

  describe('undefined handling', () => {
    it('should return empty object for undefined options', () => {
      const result = parseCliOptions({});
      expect(result.input).toBeUndefined();
      expect(result.output).toBeUndefined();
      expect(result.profile).toBeUndefined();
      expect(result.noColor).toBeUndefined();
      expect(result.dryRun).toBeUndefined();
    });

    it('should only include defined options', () => {
      const result = parseCliOptions({ input: 'test.pgn', profile: 'quick' });
      expect(Object.keys(result)).toEqual(['input', 'profile']);
    });
  });

  describe('combined options', () => {
    it('should parse multiple options together', () => {
      const result = parseCliOptions({
        input: 'game.pgn',
        output: 'annotated.pgn',
        profile: 'deep',
        verbosity: 'rich',
        targetElo: 2000,
        skipMaia: true,
        color: false,
        dryRun: true,
      });

      expect(result.input).toBe('game.pgn');
      expect(result.output).toBe('annotated.pgn');
      expect(result.profile).toBe('deep');
      expect(result.verbosity).toBe('rich');
      expect(result.targetElo).toBe(2000);
      expect(result.skipMaia).toBe(true);
      expect(result.noColor).toBe(true);
      expect(result.dryRun).toBe(true);
    });
  });
});
