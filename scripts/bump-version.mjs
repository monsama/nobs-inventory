#!/usr/bin/env node
/* Sets the version everywhere it is kept: VERSION, package.json, package-lock.json and the default image in
   docker-compose.yml. Usage: node scripts/bump-version.mjs 0.2.26 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) { console.error('Give the new version as x.y.z, for example 0.2.26.'); process.exit(1); }

/* Replaces the pattern in the file. Fails when the pattern is not there at all, so a changed file is not missed. */
const edit = (file, pattern, replacement) => {
  const p = path.join(root, file);
  const before = fs.readFileSync(p, 'utf8');
  if (!pattern.test(before)) throw new Error(`${file}: the version was not found`);
  fs.writeFileSync(p, before.replace(pattern, replacement));
};

fs.writeFileSync(path.join(root, 'VERSION'), version + '\n');
edit('package.json', /("version": ")[^"]+(")/, `$1${version}$2`);
/* package-lock.json names the app's version twice, at the top and for its root package. Every other "version"
   in it belongs to a dependency, so only the first two are changed. */
{
  const p = path.join(root, 'package-lock.json');
  let n = 0;
  const text = fs.readFileSync(p, 'utf8').replace(/("version": ")[^"]+(")/g, (m, a, b) => (n++ < 2 ? `${a}${version}${b}` : m));
  if (n < 2) throw new Error('package-lock.json: the version was not found');
  fs.writeFileSync(p, text);
}
edit('docker-compose.yml', /(nobs-inventory:)\d+\.\d+\.\d+(\})/, `$1${version}$2`);
console.log(`Version set to ${version} in VERSION, package.json, package-lock.json and docker-compose.yml.`);
