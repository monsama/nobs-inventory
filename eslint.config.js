// Lint for the server, the tests and the scripts. The front end is linted by scripts/lint-front.mjs, as one script.
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    /* Browser tests run code inside the page as well as in node, so both sets of globals apply. */
    files: ['tests/browser/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser, objs: 'readonly', rels: 'readonly', st: 'readonly', byId: 'readonly', byName: 'readonly', render: 'readonly', openObj: 'readonly', openSettings: 'readonly', closeModal: 'readonly', newObjModal: 'readonly', USERS: 'readonly', PLANS: 'readonly', RACKS: 'readonly', planSel: 'writable', flushSave: 'readonly', reloadFromServer: 'readonly', deleteObject: 'readonly', queueServerSave: 'readonly', mapFit: 'readonly', portLabel: 'readonly', parseCsv: 'readonly', newObj: 'readonly', $: 'readonly', SITES: 'readonly', LOCS: 'readonly', TYPES: 'readonly', checkForChanges: 'readonly', HISTORY: 'readonly' } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }] },
  },
  {
    files: ['server/**/*.js', 'tests/**/*.js', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }] },
  },
];
