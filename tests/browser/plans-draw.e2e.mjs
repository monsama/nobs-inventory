/* A plan without a picture still lists the devices and lets an area be drawn on it. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-plan-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await p.waitForFunction(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  await p.evaluate(async (png) => {
    const put = await fetch('api/state', {credentials:'same-origin'}); const d = await put.json();
    d.plans = [{id:'pl1', name:'EG', site:'Zürich HQ', areas:[]}];
    const save = await fetch('api/state', {method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify(d)});
    const img = {status: 0};
    return [save.status, img.status];
  }, png);
  await p.reload(); await p.waitForSelector('#lgUser, #tabsbar');
  if (await p.isVisible('#lgUser')) { await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk'); }
  await p.waitForFunction(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render-plans.js')]); __mods[0].st.tab = 'plans'; __mods[1].render(); });
  await p.waitForSelector('#plList');
  assert.equal(await p.locator('#plList .pl-item').count(), 7, 'the devices not on the plan are not listed');
  await p.click('#plArea');
  const box = await p.locator('#plCanvas').boundingBox();
  assert.ok(box.height >= 300, 'a plan without a picture has no room to draw on: ' + box.height);
  await p.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  assert.equal(await p.isVisible('#arName'), true, 'the area dialog did not open');
  assert.equal(await p.evaluate(() => document.querySelector('#toolbar').textContent.trim()), '', 'the toolbar of another tab is still shown on the plans');
  assert.deepEqual(errors, [], 'page errors');
  console.log('plans: drawing an area works without a picture: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir,{recursive:true,force:true}); }
