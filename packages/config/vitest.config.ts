import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Package-local cache: see packages/domain/vitest.config.ts.
  cacheDir: './node_modules/.vitest-cache',
  test: { include: ['src/**/*.test.ts'] },
});
