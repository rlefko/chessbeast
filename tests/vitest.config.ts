import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@chessbeast/cli': path.resolve(__dirname, '../packages/cli/dist'),
      '@chessbeast/core': path.resolve(__dirname, '../packages/core/dist'),
      '@chessbeast/pgn': path.resolve(__dirname, '../packages/pgn/dist'),
      '@chessbeast/database': path.resolve(__dirname, '../packages/database/dist'),
      '@chessbeast/llm': path.resolve(__dirname, '../packages/llm/dist'),
      '@chessbeast/grpc-client': path.resolve(__dirname, '../packages/grpc-client/dist'),
      '@chessbeast/test-utils': path.resolve(__dirname, '../packages/test-utils/dist'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 30000, // 30 seconds for longer tests
  },
});
