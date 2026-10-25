// App ESLint config: Expo's recommended flat config + architecture guardrails (ARCHITECTURE §3).
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  { ignores: ['dist/*', 'dist-*/**', '.expo/*', 'android/**', 'ios/**', 'expo-env.d.ts'] },
  {
    files: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message:
                "Import from 'zod/mini': classic zod drags ~60 kB gzip into the web bundle (docs/PERFORMANCE.md).",
            },
          ],
          patterns: [
            {
              group: ['@supabase/*'],
              message:
                'Supabase may only be imported in src/lib/supabase or a feature api folder (src/features/*/api).',
            },
            {
              group: ['@/features/*/*'],
              message: 'Import other features only through their public index (@/features/<name>).',
            },
            {
              group: ['@/lib/supabase', '@/lib/supabase/*'],
              message:
                'Use the Supabase client only from a feature api folder (src/features/*/api).',
            },
          ],
        },
      ],
    },
  },
  {
    // The only places allowed to talk to Supabase directly.
    files: ['src/lib/supabase/**', 'src/features/*/api/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message:
                "Import from 'zod/mini': classic zod drags ~60 kB gzip into the web bundle (docs/PERFORMANCE.md).",
            },
          ],
          patterns: [
            {
              group: ['@/features/*/*'],
              message: 'Import other features only through their public index (@/features/<name>).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'jest.setup.js', 'e2e/**'],
    rules: { 'no-console': 'off', 'no-restricted-imports': 'off' },
  },
];
