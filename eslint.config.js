// Lint for the server, the tests and the scripts. The front end is linted by scripts/lint-front.mjs, as one script.
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
    files: ['server/**/*.js', 'tests/**/*.js', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }] },
  },
];
