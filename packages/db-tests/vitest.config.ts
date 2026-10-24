import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: './node_modules/.vitest-cache',
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Tests share one database; each test creates uniquely named users, but serial files keep
    // failures easy to read and avoid hammering the local Auth server's rate limits.
    fileParallelism: false,
  },
});
