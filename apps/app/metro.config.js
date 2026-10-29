const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * Metro does not tree-shake, and both `zod/mini` and `zod/v4/core` re-export (`export *`) every
 * locale (~80 files), the JSON-Schema generator and the schema compiler. The app uses none of them
 * (messages are our own stable keys), yet they were ~90 % of zod's minified size in the web bundle.
 * zod's own schema code only `import type`s from these modules, so resolving them to an empty module is
 * safe. Measured effect and how to re-check: docs/PERFORMANCE.md.
 */
const UNUSED_ZOD_MODULES =
  /[\\/]zod[\\/]v4[\\/](?:locales[\\/]index|core[\\/](?:compile|to-json-schema|json-schema-processors|json-schema-generator))\.c?js$/;
/**
 * Same idea for Sentry on web: `@sentry/browser` re-exports session replay and the feedback widget, so
 * they ship (~57 kB gzip) in the lazily loaded Sentry chunk although the app never calls them (no replay
 * in the MVP, sendDefaultPii off; see lib/observability/sentry.ts). They resolve to a stub (metro/sentry-unused-stub.js) because an empty module breaks Sentry's own
 * initialization; using `replayIntegration` / `feedbackIntegration` then throws: remove this entry first. Verified with a dummy DSN in docs/PERFORMANCE.md §3.6.
 */
const UNUSED_SENTRY_MODULES =
  /[\\/]node_modules[\\/]@sentry[\\/](?:replay|feedback)[\\/]build[\\/]npm[\\/](?:esm|cjs)[\\/]index\.js$/;
/**
 * Web only: supabase-js always pulls in the realtime and storage clients (~23 kB gzip) although the app
 * uses neither (notifications are polled, ADR-0019; no uploads yet). They resolve to small stand-ins
 * (metro/supabase-unused-stub.js). Remove an entry before using Realtime or Storage on web. Native keeps
 * the real packages: that build is the one validated on the device suite.
 */
const SUPABASE_UNUSED_PACKAGES = new Set(['@supabase/realtime-js', '@supabase/storage-js']);
const FROM_SUPABASE_JS = /[\\/]@supabase[\\/]supabase-js[\\/]/;
const SUPABASE_STUB = path.join(__dirname, 'metro', 'supabase-unused-stub.js');
const EMPTY_MODULE = path.join(__dirname, 'metro', 'empty-module.js');
const SENTRY_STUB = path.join(__dirname, 'metro', 'sentry-unused-stub.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    SUPABASE_UNUSED_PACKAGES.has(moduleName) &&
    FROM_SUPABASE_JS.test(context.originModulePath)
  ) {
    return { type: 'sourceFile', filePath: SUPABASE_STUB };
  }
  const resolution = context.resolveRequest(context, moduleName, platform);
  if (resolution.type !== 'sourceFile') return resolution;
  if (UNUSED_ZOD_MODULES.test(resolution.filePath)) {
    return { type: 'sourceFile', filePath: EMPTY_MODULE };
  }
  if (UNUSED_SENTRY_MODULES.test(resolution.filePath)) {
    return { type: 'sourceFile', filePath: SENTRY_STUB };
  }
  return resolution;
};

module.exports = config;
