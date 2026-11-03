#!/usr/bin/env node
/* Lints the front end: every module in public/js, as a browser ES module. A name used in one module and defined in
   another must be imported, so a missing import is reported as an undefined name. Assigning to an imported name is
   reported too (an imported binding is read-only). Markup built by hand from a plain template string with values in
   it (innerHTML = `…${x}…`, insertAdjacentHTML, modal()) is reported too: html`` escapes every value (html.js). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import globals from 'globals';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'js');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();

/* Markup a module still builds by hand, and why: at most this many places in that file. A new one, here or anywhere
   else, is an error. */
const RAW_HTML_ALLOWED = {
  '07-render.js': [10, 'being split into modules; converted after the split'],
  '05-new-object.js': [2, 'the New device and Link device dialogs: built with portField() and comboHtml(), still escaped with esc()'],
  '08-sheets.js': [2, 'the entry sheet dialog and its print view: still escaped with esc()'],
  'settings-feed.js': [6, 'Lansweeper settings (models, type map, type rules, push): still escaped with esc()'],
  'settings-graph.js': [4, 'Entra & Intune settings: still escaped with esc()'],
  'settings-ldap.js': [4, 'Active Directory settings: still escaped with esc()'],
  'settings-network.js': [4, 'locations, VLANs, subnets and domains: still escaped with esc()'],
  'settings-types.js': [4, 'device types, their fields and card lines: still escaped with esc()'],
};

/* A plain template string with values and a tag in it, where markup is set: the value itself, or either side of a
   ?:, || or +. What a function returns is not followed: the function is checked where it builds its string. */
const rawHtmlRule = {
  meta: { type: 'problem', messages: { raw: 'Markup built from a template string with values: use html`` (public/js/html.js).' } },
  create(context){
    const check = node => {
      if (!node) return;
      if (node.type === 'TemplateLiteral'){
        if (node.expressions.length && node.quasis.some(q => q.value.raw.includes('<'))) context.report({ node, messageId: 'raw' });
      } else if (node.type === 'ConditionalExpression'){ check(node.consequent); check(node.alternate); }
      else if (node.type === 'LogicalExpression' || (node.type === 'BinaryExpression' && node.operator === '+')){ check(node.left); check(node.right); }
    };
    const prop = m => m && m.type === 'MemberExpression' && !m.computed && m.property.name;
    return {
      AssignmentExpression(node){ if (['innerHTML', 'outerHTML'].includes(prop(node.left))) check(node.right); },
      CallExpression(node){
        const c = node.callee;
        if (prop(c) === 'insertAdjacentHTML') check(node.arguments[1]);
        else if (c.type === 'Identifier' && c.name === 'modal') check(node.arguments[0]);
        else if (c.type === 'Identifier' && c.name === 'confirmModal') check(node.arguments[1]);
      },
    };
  },
};

const linter = new Linter({ configType: 'flat' });
const config = [{
  plugins: { ni: { rules: { 'no-raw-html': rawHtmlRule } } },
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
  rules: { 'no-undef': 'error', 'no-import-assign': 'error', 'no-unused-vars': ['warn', { args: 'none' }], 'ni/no-raw-html': 'error' },
}];

let errors = 0, warnings = 0;
for (const f of files) {
  const found = linter.verify(fs.readFileSync(path.join(dir, f), 'utf8'), config);
  const raw = found.filter(m => m.ruleId === 'ni/no-raw-html'), allowed = RAW_HTML_ALLOWED[f] ? RAW_HTML_ALLOWED[f][0] : 0;
  for (const m of found) {
    if (m.ruleId === 'ni/no-raw-html' && raw.length <= allowed) continue;
    if (m.severity === 2) errors++; else warnings++;
    console.log(`public/js/${f}:${m.line}:${m.column}  ${m.severity === 2 ? 'error' : 'warning'}  ${m.message}  ${m.ruleId}`);
  }
  if (raw.length > allowed && allowed) console.log(`public/js/${f}: ${raw.length} places build markup by hand; the allowlist has ${allowed}`);
}
console.log(`front end: ${files.length} modules, ${errors} errors, ${warnings} warnings`);
process.exit(errors ? 1 : 0);
