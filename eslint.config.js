// Lint for the server, the page modules, the tests and the scripts. scripts/lint-front.mjs adds the page's own rules.
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    /* Browser tests run code inside the page as well as in node. The app's names are read through their modules. */
    files: ['tests/browser/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }] },
  },
  {
    /* The page modules run in the browser only. */
    files: ['public/js/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }] },
  },
  {
    files: ['server/**/*.js', 'tests/**/*.js', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }] },
  },
];
