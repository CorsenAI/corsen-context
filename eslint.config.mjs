import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  {
    // The WordPress plugin ships one classic (non-module) browser script.
    files: ['packages/wordpress-plugin/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        AbortSignal: 'readonly',
        Promise: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        navigator: 'readonly',
        window: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      'no-undef': 'off',
    },
  },
];
