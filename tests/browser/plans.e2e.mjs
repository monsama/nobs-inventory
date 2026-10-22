/* Browser test of the floor-plan viewer: an image is uploaded, an area is drawn, and a device is placed on the plan. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-plans-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const app = createApp({ db });
const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await context.addInitScript(() => localStorage.setItem('ni-started', '1'));
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForFunction(() => /Admin/.test(document.querySelector('#whoBtn').textContent));
  await page.waitForFunction(() => /Admin/.test(document.querySelector('#whoBtn').textContent));
  await page.click('#newBtn'); await page.waitForSelector('#nName');
  await page.fill('#nName', 'PC-PLAN'); await page.click('#nOk');
  await page.waitForTimeout(500);
  await page.click('#tabsbar [data-tab=plans]');
  await page.waitForSelector('#plNew2');
  await page.click('#plNew2');
  await page.fill('#plName', 'Ground floor');
  // a small PNG, generated in the browser so no file is needed
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 240; const g = c.getContext('2d'); g.fillStyle = '#eee'; g.fillRect(0, 0, 400, 240); g.fillStyle = '#999'; g.fillRect(40, 40, 120, 90); return c.toDataURL('image/png'); });
  await page.setInputFiles('#plFile', { name: 'plan.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
  await page.click('#plOk');
  await page.waitForSelector('#plCanvas img');
  await page.click('#plArea');
  const box = await page.locator('#plCanvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 }); await page.mouse.up();
  await page.fill('#arName', 'Open office'); await page.click('#arOk');
  await page.waitForSelector('.pl-area');
  await page.click('.pl-item:has-text("PC-PLAN")');
  await page.click('#plCanvas', { position: { x: box.width * 0.7, y: box.height * 0.7 } });
  await page.waitForSelector('.pl-pin:has-text("PC-PLAN")');
  await page.waitForTimeout(600);
  const saved = loadState(db);
  assert.equal(saved.plans.length, 1, 'the plan is saved on the server');
  assert.equal(saved.plans[0].areas[0].name, 'Open office', 'the area is saved');
  assert.ok(saved.objs.find(o => o.name === 'PC-PLAN').planPos, 'the device is placed on the plan');
  assert.equal(errors.length, 0, 'no page errors: ' + errors.join('; '));
  console.log('browser floor plans: all checks passed');
} finally {
  await browser.close(); server.close(); db.close();
}
