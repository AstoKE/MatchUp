import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Package-local cache: parallel `pnpm -r test` runs must not share one cache directory
  // (observed intermittent EPERM on the shared root cache, esp. under OneDrive).
  cacheDir: './node_modules/.vitest-cache',
  test: { include: ['src/**/*.test.ts'] },
});
