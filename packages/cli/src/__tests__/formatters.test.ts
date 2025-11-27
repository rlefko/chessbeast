/**
 * Formatting utilities tests
 */

import { describe, it, expect } from 'vitest';

import {
  formatDuration,
  formatFileSize,
  formatEta,
  formatProgressBar,
  formatPercentage,
} from '../progress/formatters.js';

describe('formatDuration', () => {
  it('should format milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('should format seconds', () => {
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(5000)).toBe('5.0s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(125000)).toBe('2m 5s');
  });
});

describe('formatFileSize', () => {
  it('should format bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('should format kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(2560)).toBe('2.5 KB');
  });

  it('should format megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(5242880)).toBe('5.0 MB');
  });
});

describe('formatEta', () => {
  it('should return empty string for null', () => {
    expect(formatEta(null)).toBe('');
  });

  it('should format zero or negative as almost done', () => {
    expect(formatEta(0)).toBe('almost done');
    expect(formatEta(-100)).toBe('almost done');
  });

  it('should format sub-second duration', () => {
    expect(formatEta(500)).toBe('less than a second');
    expect(formatEta(999)).toBe('less than a second');
  });

  it('should format seconds', () => {
    expect(formatEta(1000)).toBe('~1s');
    expect(formatEta(5000)).toBe('~5s');
    expect(formatEta(59999)).toBe('~60s');
  });

  it('should format minutes and seconds', () => {
    expect(formatEta(60000)).toBe('~1m');
    expect(formatEta(90000)).toBe('~1m 30s');
    expect(formatEta(150000)).toBe('~2m 30s');
  });

  it('should round seconds up', () => {
    expect(formatEta(61500)).toBe('~1m 2s'); // 61.5s rounds to 1m 2s
  });
});

describe('formatProgressBar', () => {
  it('should format empty bar at 0%', () => {
    expect(formatProgressBar(0, 100, 10)).toBe('[          ]');
  });

  it('should format full bar at 100%', () => {
    expect(formatProgressBar(100, 100, 10)).toBe('[==========]');
  });

  it('should format half bar at 50%', () => {
    expect(formatProgressBar(50, 100, 10)).toBe('[=====     ]');
  });

  it('should format partial bar', () => {
    expect(formatProgressBar(30, 100, 10)).toBe('[===       ]');
  });

  it('should handle over 100% gracefully', () => {
    expect(formatProgressBar(150, 100, 10)).toBe('[==========]');
  });

  it('should handle zero total gracefully', () => {
    expect(formatProgressBar(50, 0, 10)).toBe('[??????????]');
  });

  it('should use default width', () => {
    const bar = formatProgressBar(50, 100);
    expect(bar.length).toBe(22); // 20 chars + 2 brackets
  });
});

describe('formatPercentage', () => {
  it('should format 0%', () => {
    expect(formatPercentage(0, 100)).toBe('0%');
  });

  it('should format 100%', () => {
    expect(formatPercentage(100, 100)).toBe('100%');
  });

  it('should format partial percentages', () => {
    expect(formatPercentage(50, 100)).toBe('50%');
    expect(formatPercentage(33, 100)).toBe('33%');
  });

  it('should round to nearest integer', () => {
    expect(formatPercentage(1, 3)).toBe('33%');
    expect(formatPercentage(2, 3)).toBe('67%');
  });

  it('should handle zero total', () => {
    expect(formatPercentage(50, 0)).toBe('0%');
  });
});
