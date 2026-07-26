import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import { baseConfig } from '@kitchen/config/eslint';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

// Only `core-web-vitals` — `next/typescript` registers the @typescript-eslint
// plugin a second time, which flat config rejects. baseConfig supplies the
// TypeScript rules instead.
export default [
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals'),
  // `rtl` bans physical-direction Tailwind classes so Arabic mirrors correctly.
  ...baseConfig({ rtl: true }),
];
