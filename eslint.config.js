// Lint for the front end (a classic script that shares one global scope) and the server (ES modules).
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['public/app.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }] },
  },
  {
    /* Browser tests run code inside the page as well as in node, so both sets of globals apply. */
    files: ['tests/browser/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser, objs: 'readonly', rels: 'readonly', st: 'readonly', byId: 'readonly', byName: 'readonly', render: 'readonly', openObj: 'readonly', openSettings: 'readonly', closeModal: 'readonly', newObjModal: 'readonly', USERS: 'readonly', PLANS: 'readonly', RACKS: 'readonly', planSel: 'writable', flushSave: 'readonly', reloadFromServer: 'readonly', deleteObject: 'readonly', queueServerSave: 'readonly', mapFit: 'readonly', portLabel: 'readonly', parseCsv: 'readonly', newObj: 'readonly', $: 'readonly', SITES: 'readonly', LOCS: 'readonly', TYPES: 'readonly', checkForChanges: 'readonly', HISTORY: 'readonly' } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }] },
  },
  {
    files: ['server/**/*.js', 'tests/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }] },
  },
];
