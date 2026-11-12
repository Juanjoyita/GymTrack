import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/playwright-report/**', '**/test-results/**', '**/*.min.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ['**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
);
