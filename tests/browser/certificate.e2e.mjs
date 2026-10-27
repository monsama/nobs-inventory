/* Browser test of the HTTPS certificate: the proxy presents one that ends in 10 days; the Overview says so under Needs
   attention, its line opens Settings → Maintenance, which shows what the certificate is for, who issued it and until
   when. Then a certificate valid for long: no line on the Overview, "Valid" in Maintenance. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { execFileSync } from 'node:child_process';
import tls from 'node:tls';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-cert-e2e-'));
/* A certificate as AD CS issues it, from a CA, for the long and the short name. */
const ssl = (...a) => execFileSync('openssl', a, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] });
ssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '3650', '-subj', '/CN=argo-ARGODC02-CA-1');
ssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'inv.key', '-out', 'inv.csr', '-subj', '/CN=inventory.argolite.ch');
fs.writeFileSync(path.join(dir, 'ext'), 'subjectAltName=DNS:inventory.argolite.ch,DNS:inventory\n');
const issue = days => { ssl('x509', '-req', '-in', 'inv.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', `inv-${days}.crt`, '-days', String(days), '-extfile', 'ext'); return fs.readFileSync(path.join(dir, `inv-${days}.crt`)); };
const key = fs.readFileSync(path.join(dir, 'inv.key'));
const proxy = tls.createServer({ key, cert: issue(10) }, s => s.end());
await new Promise(r => proxy.listen(0, '127.0.0.1', r));

const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const server = await new Promise(r => { const x = createApp({ db, certProbe: { host: '127.0.0.1', port: proxy.address().port } }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const shots = process.env.NI_SHOTS;
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForSelector('.card, .empty');
  await page.evaluate(async () => { (await import('/js/01-core.js')).st.tab = 'overview'; (await import('/js/07-render-plans.js')).render(); });

  // the Overview: a line under Needs attention, once the certificate is known
  const line = page.locator('[data-ovcert]');
  await line.waitFor();
  assert.match(await line.textContent(), /HTTPS certificate ends soon/);
  assert.match(await line.textContent(), /(9|10) days left/);
  if (shots) await page.locator('.ov-cols .panelbox').first().screenshot({ path: path.join(shots, 'cert-overview.png') });
  // it opens Settings → Maintenance, with the certificate on top
  await line.click();
  await page.waitForSelector('#certPanel dl');
  const panel = await page.textContent('#certPanel');
  assert.match(panel, /Ends soon/);
  assert.match(panel, /inventory\.argolite\.ch, inventory/);
  assert.match(panel, /Issued by\s*argo-ARGODC02-CA-1/);
  assert.match(panel, /install-cert\.sh inventory/);
  assert.equal(await page.locator('[data-st="maintenance"].active').count(), 1, 'Maintenance is the tab shown');
  if (shots) await page.locator('#certPanel').screenshot({ path: path.join(shots, 'cert-panel.png') });

  // a new certificate is installed on the proxy: "Check again" reads it
  proxy.setSecureContext({ key, cert: issue(730) });
  await page.click('#certRefresh');
  await page.waitForFunction(() => /Valid/.test(document.querySelector('#certPanel .hdr')?.textContent || ''));
  assert.match(await page.textContent('#certPanel'), /(729|730) days left/);
  await page.click('#setClose');
  await page.evaluate(async () => { (await import('/js/01-core.js')).st.tab = 'overview'; (await import('/js/07-render-plans.js')).render(); });
  await page.waitForSelector('.ov-cols');
  assert.equal(await page.locator('[data-ovcert]').count(), 0, 'no line for a certificate valid for long');

  assert.deepEqual(errors, []);
  console.log('certificate: all checks passed');
} finally { await browser.close(); server.close(); proxy.close(); }
