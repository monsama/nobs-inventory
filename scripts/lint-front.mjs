#!/usr/bin/env node
/* Lints the front end: every module in public/js, as a browser ES module. A name used in one module and defined in
   another must be imported, so a missing import is reported as an undefined name. Assigning to an imported name is
   reported too (an imported binding is read-only). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import globals from 'globals';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'js');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
const linter = new Linter({ configType: 'flat' });
const config = [{
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
  rules: { 'no-undef': 'error', 'no-import-assign': 'error', 'no-unused-vars': ['warn', { args: 'none' }] },
}];

let errors = 0, warnings = 0;
for (const f of files) {
  for (const m of linter.verify(fs.readFileSync(path.join(dir, f), 'utf8'), config)) {
    if (m.severity === 2) errors++; else warnings++;
    console.log(`public/js/${f}:${m.line}:${m.column}  ${m.severity === 2 ? 'error' : 'warning'}  ${m.message}  ${m.ruleId}`);
  }
}
console.log(`front end: ${files.length} modules, ${errors} errors, ${warnings} warnings`);
process.exit(errors ? 1 : 0);
