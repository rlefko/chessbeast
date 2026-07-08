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
        lines: 54,
        functions: 51,
        branches: 73,
      },
    },
  },
});
