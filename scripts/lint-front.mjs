#!/usr/bin/env node
/* Lints the front end as one script. Its files are loaded one after another and share one global scope, so they are
   joined in load order (the same order as public/index.html) and linted together: a name defined in one file and used in
   another is then not reported as undefined. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import globals from 'globals';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
if (!files.length) { console.error('No front-end scripts are listed in public/index.html.'); process.exit(1); }
const source = files.map(f => fs.readFileSync(path.join(root, 'public', f), 'utf8')).join('');

/* A classic script in the browser: browser globals, and no import or export. */
const eslint = new ESLint({
  cwd: root,
  overrideConfig: { languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser } }, rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }] } },
});
const [result] = await eslint.lintText(source, { filePath: path.join(root, 'public', 'js', 'all.js') });
const errors = result.messages.filter(m => m.severity === 2);
for (const m of result.messages) console.log(`${m.line}:${m.column}  ${m.severity === 2 ? 'error' : 'warning'}  ${m.message}  ${m.ruleId}`);
console.log(`front end: ${files.length} files, ${result.messages.length} problems (${errors.length} errors)`);
process.exit(errors.length ? 1 : 0);
