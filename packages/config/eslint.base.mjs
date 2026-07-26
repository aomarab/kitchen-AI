import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Tailwind utilities that hard-code a physical side. Banned because the UI must
 * mirror correctly in Arabic (RTL) — use logical equivalents instead:
 *   ml-/mr-      -> ms-/me-
 *   pl-/pr-      -> ps-/pe-
 *   left-/right- -> start-/end-
 *   text-left    -> text-start
 *   border-l/r   -> border-s/border-e
 */
const PHYSICAL_TAILWIND =
  /(?:^|\s)-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br)-|(?:^|\s)(?:text|float|clear)-(?:left|right)(?:\s|$)/;

/**
 * React Native / CSS-in-JS style keys that hard-code a physical side.
 * Use marginStart/marginEnd/paddingStart/paddingEnd/start/end instead.
 */
const PHYSICAL_STYLE_KEY =
  /^(?:marginLeft|marginRight|paddingLeft|paddingRight|borderLeftWidth|borderRightWidth|borderLeftColor|borderRightColor|left|right)$/;

const RTL_MESSAGE =
  'Physical direction detected. Use logical properties (start/end, ms/me, ps/pe) so the UI mirrors correctly in Arabic.';

/**
 * Shared ESLint config for every workspace package.
 *
 * @param {{ rtl?: boolean, styleKeys?: boolean }} [options]
 *   rtl       - ban physical-direction Tailwind classes in string literals (web)
 *   styleKeys - ban physical-direction style object keys (mobile / CSS-in-JS)
 */
export function baseConfig(options = {}) {
  const { rtl = false, styleKeys = false } = options;

  /** @type {Array<{selector: string, message: string}>} */
  const restrictedSyntax = [];

  if (rtl) {
    restrictedSyntax.push({
      selector: `Literal[value=${PHYSICAL_TAILWIND}]`,
      message: RTL_MESSAGE,
    });
    restrictedSyntax.push({
      selector: `TemplateElement[value.raw=${PHYSICAL_TAILWIND}]`,
      message: RTL_MESSAGE,
    });
  }

  if (styleKeys) {
    restrictedSyntax.push({
      selector: `Property[key.name=${PHYSICAL_STYLE_KEY}]`,
      message: RTL_MESSAGE,
    });
  }

  return tseslint.config(
    { ignores: ['dist/**', '.next/**', '.expo/**', 'coverage/**', 'node_modules/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        'no-restricted-syntax': restrictedSyntax.length ? ['error', ...restrictedSyntax] : 'off',
        eqeqeq: ['error', 'always', { null: 'ignore' }],
        'no-console': ['warn', { allow: ['warn', 'error'] }],
      },
    },
  );
}

export default baseConfig();
