import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import { fileURLToPath } from 'node:url';

const tsconfigRootDir = fileURLToPath(new URL('.', import.meta.url));
const typeCheckedRules =
  tsPlugin.configs['recommended-type-checked']?.rules ?? {};

const nodeLanguageOptions = {
  parser: tsParser,
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir,
    sourceType: 'module',
    ecmaVersion: 2022
  },
  globals: {
    ...globals.node
  }
};

export default [
  {
    ignores: ['out/**', 'dist/**']
  },
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: nodeLanguageOptions,
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      ...typeCheckedRules,
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      'no-undef': 'off'
    }
  },
  {
    files: ['test/**/*.ts'],
    languageOptions: nodeLanguageOptions,
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      ...typeCheckedRules,
      '@typescript-eslint/no-floating-promises': 'off',
      'no-undef': 'off'
    }
  },
  {
    files: ['test/vsix-smoke-extension/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.node
      }
    }
  }
];
