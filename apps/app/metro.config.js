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
const EMPTY_MODULE = path.join(__dirname, 'metro', 'empty-module.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolution = context.resolveRequest(context, moduleName, platform);
  if (resolution.type === 'sourceFile' && UNUSED_ZOD_MODULES.test(resolution.filePath)) {
    return { type: 'sourceFile', filePath: EMPTY_MODULE };
  }
  return resolution;
};

module.exports = config;
