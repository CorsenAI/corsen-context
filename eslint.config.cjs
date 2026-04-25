const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

const globals = {
  AbortSignal: 'readonly',
  ArrayBuffer: 'readonly',
  Blob: 'readonly',
  Buffer: 'readonly',
  Headers: 'readonly',
  ReadableStream: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  TextEncoder: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  clearInterval: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  process: 'readonly',
  setInterval: 'readonly',
};

module.exports = [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.turbo/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals,
    },
  },
];
