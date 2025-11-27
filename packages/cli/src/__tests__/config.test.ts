/**
 * Configuration system tests
 */

import { describe, it, expect } from 'vitest';

import { DEFAULT_CONFIG, ANALYSIS_PROFILES, applyProfile } from '../config/defaults.js';
import {
  validateConfig,
  validatePartialConfig,
  ConfigValidationError,
} from '../config/validation.js';

describe('Config Defaults', () => {
  describe('DEFAULT_CONFIG', () => {
    it('should have all required top-level properties', () => {
      expect(DEFAULT_CONFIG).toHaveProperty('analysis');
      expect(DEFAULT_CONFIG).toHaveProperty('ratings');
      expect(DEFAULT_CONFIG).toHaveProperty('llm');
      expect(DEFAULT_CONFIG).toHaveProperty('services');
      expect(DEFAULT_CONFIG).toHaveProperty('databases');
      expect(DEFAULT_CONFIG).toHaveProperty('output');
    });

    it('should have valid default analysis config', () => {
      expect(DEFAULT_CONFIG.analysis.profile).toBe('standard');
      expect(DEFAULT_CONFIG.analysis.shallowDepth).toBe(14);
      expect(DEFAULT_CONFIG.analysis.deepDepth).toBe(22);
      expect(DEFAULT_CONFIG.analysis.multiPvCount).toBe(3);
      expect(DEFAULT_CONFIG.analysis.maxCriticalRatio).toBe(0.25);
      expect(DEFAULT_CONFIG.analysis.skipMaia).toBe(false);
      expect(DEFAULT_CONFIG.analysis.skipLlm).toBe(false);
    });

    it('should have valid default service endpoints', () => {
      expect(DEFAULT_CONFIG.services.stockfish.host).toBe('localhost');
      expect(DEFAULT_CONFIG.services.stockfish.port).toBe(50051);
      expect(DEFAULT_CONFIG.services.maia.host).toBe('localhost');
      expect(DEFAULT_CONFIG.services.maia.port).toBe(50052);
    });

    it('should have valid default output config', () => {
      expect(DEFAULT_CONFIG.output.verbosity).toBe('normal');
      expect(DEFAULT_CONFIG.output.includeVariations).toBe(true);
      expect(DEFAULT_CONFIG.output.includeNags).toBe(true);
      expect(DEFAULT_CONFIG.output.includeSummary).toBe(true);
    });
  });

  describe('ANALYSIS_PROFILES', () => {
    it('should have quick, standard, and deep profiles', () => {
      expect(ANALYSIS_PROFILES).toHaveProperty('quick');
      expect(ANALYSIS_PROFILES).toHaveProperty('standard');
      expect(ANALYSIS_PROFILES).toHaveProperty('deep');
    });

    it('quick profile should have lower depths', () => {
      expect(ANALYSIS_PROFILES.quick.shallowDepth).toBe(12);
      expect(ANALYSIS_PROFILES.quick.deepDepth).toBe(16);
      expect(ANALYSIS_PROFILES.quick.multiPvCount).toBe(1);
      expect(ANALYSIS_PROFILES.quick.maxCriticalRatio).toBe(0.15);
    });

    it('deep profile should have higher depths', () => {
      expect(ANALYSIS_PROFILES.deep.shallowDepth).toBe(18);
      expect(ANALYSIS_PROFILES.deep.deepDepth).toBe(28);
      expect(ANALYSIS_PROFILES.deep.multiPvCount).toBe(5);
      expect(ANALYSIS_PROFILES.deep.maxCriticalRatio).toBe(0.35);
    });
  });

  describe('applyProfile', () => {
    it('should apply quick profile settings', () => {
      const config = applyProfile(DEFAULT_CONFIG.analysis, 'quick');
      expect(config.profile).toBe('quick');
      expect(config.shallowDepth).toBe(12);
      expect(config.deepDepth).toBe(16);
    });

    it('should apply deep profile settings', () => {
      const config = applyProfile(DEFAULT_CONFIG.analysis, 'deep');
      expect(config.profile).toBe('deep');
      expect(config.shallowDepth).toBe(18);
      expect(config.deepDepth).toBe(28);
    });

    it('should preserve other settings when applying profile', () => {
      const customConfig = {
        ...DEFAULT_CONFIG.analysis,
        skipMaia: true,
        skipLlm: true,
      };
      const config = applyProfile(customConfig, 'quick');
      expect(config.skipMaia).toBe(true);
      expect(config.skipLlm).toBe(true);
    });
  });
});

describe('Config Validation', () => {
  describe('validateConfig', () => {
    it('should accept valid default config', () => {
      expect(() => validateConfig(DEFAULT_CONFIG)).not.toThrow();
    });

    it('should reject config with invalid analysis profile', () => {
      const config = {
        ...DEFAULT_CONFIG,
        analysis: { ...DEFAULT_CONFIG.analysis, profile: 'invalid' },
      };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });

    it('should reject config with deepDepth < shallowDepth', () => {
      const config = {
        ...DEFAULT_CONFIG,
        analysis: { ...DEFAULT_CONFIG.analysis, shallowDepth: 20, deepDepth: 10 },
      };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });

    it('should reject config with invalid port', () => {
      const config = {
        ...DEFAULT_CONFIG,
        services: {
          ...DEFAULT_CONFIG.services,
          stockfish: { ...DEFAULT_CONFIG.services.stockfish, port: 99999 },
        },
      };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });

    it('should reject config with maxCriticalRatio > 1', () => {
      const config = {
        ...DEFAULT_CONFIG,
        analysis: { ...DEFAULT_CONFIG.analysis, maxCriticalRatio: 1.5 },
      };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });

    it('should reject config with invalid verbosity', () => {
      const config = {
        ...DEFAULT_CONFIG,
        output: { ...DEFAULT_CONFIG.output, verbosity: 'verbose' },
      };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });
  });

  describe('validatePartialConfig', () => {
    it('should accept empty config', () => {
      expect(() => validatePartialConfig({})).not.toThrow();
    });

    it('should accept partial analysis config', () => {
      const partial = {
        analysis: { profile: 'deep' },
      };
      expect(() => validatePartialConfig(partial)).not.toThrow();
    });

    it('should reject invalid values in partial config', () => {
      const partial = {
        analysis: { shallowDepth: -5 },
      };
      expect(() => validatePartialConfig(partial)).toThrow(ConfigValidationError);
    });
  });

  describe('ConfigValidationError', () => {
    it('should format errors properly', () => {
      const error = new ConfigValidationError([
        { path: 'analysis.profile', message: 'Invalid profile' },
        { path: 'services.stockfish.port', message: 'Port out of range' },
      ]);

      const formatted = error.format();
      expect(formatted).toContain('Configuration validation failed');
      expect(formatted).toContain('analysis.profile');
      expect(formatted).toContain('services.stockfish.port');
    });
  });
});
