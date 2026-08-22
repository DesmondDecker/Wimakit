/* eslint-env node */
import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  ...compat.extends('expo'),
  {
    languageOptions: {
      globals: {
        URL: 'readonly',
      },
    },
  },
];
