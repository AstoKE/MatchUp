import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Package-local cache: parallel `pnpm -r test` runs must not share one cache directory
  // (observed intermittent EPERM on the shared root cache, esp. under OneDrive).
  cacheDir: './node_modules/.vitest-cache',
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      reporter: ['text-summary', 'lcov'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
