import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 30000, // 30 seconds for longer tests
  },
});
