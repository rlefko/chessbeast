import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**'],
      exclude: ['src/**/__tests__/**', 'src/**/index.ts', 'src/bin/**'],
      thresholds: {
        lines: 25,
        functions: 59,
        branches: 75,
      },
    },
  },
});
