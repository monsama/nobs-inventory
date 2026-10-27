/* Browser test of zooming and of a search the filters hide:
   - the floor plan zooms with Ctrl + wheel at the pointer (the spot under it stays put), the wheel alone scrolls, and
     the buttons zoom around the middle instead of jumping to the top left;
   - the relationship map zooms with Ctrl + wheel;
   - a search for an object of another type than the one picked on the left says it exists, in the cards, the table
     and the relationship map, and "Search all objects" shows it with its relations. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-zoom-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const o = (id, type, name, extra = {}) => ({ id, code: 'INV-' + id, type, name, status: 'active', loc: 'HQ / Hall', ovr: {}, feed: null, ...extra });
saveState(db, { ...loadState(db), locs: ['HQ / Hall'], sites: ['HQ'],
  objs: [o('p1', 'pc', 'PC-01', { ip: '172.21.104.20', planPos: { plan: 'pl1', x: 70, y: 25 } }), o('p2', 'pc', 'PC-02'),
    o('s1', 'switch', '172.21.103.2', { ip: '172.21.103.2', ports: 24 })],
  rels: [{ id: 'r1', from: 'p2', to: 's1', kind: 'connected', port: 3 }],
  plans: [{ id: 'pl1', name: 'EG', site: 'HQ', areas: [] }], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const go = tab => p.evaluate(async t => { (await import('/js/01-core.js')).st.tab = t; (await import('/js/07-render-plans.js')).render(); }, tab);

  // the floor plan
  await go('plans');
  await p.waitForSelector('#plCanvas');
  const zoomText = () => p.textContent('#plZoomReset');
  assert.equal((await zoomText()).trim(), '100%');
  const pin = async () => { const b = await p.locator('[data-pin=p1]').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // the wheel alone does not zoom
  let at = await pin();
  await p.mouse.move(at.x, at.y); await p.mouse.wheel(0, -100);
  assert.equal((await zoomText()).trim(), '100%');
  // zoomed in with the buttons first, so the plan is larger than the view both ways and can be held at any spot
  for (let i = 0; i < 4; i++) await p.click('#plZoomIn');
  assert.equal((await zoomText()).trim(), '200%');
  const before = await pin();
  await p.mouse.move(before.x, before.y);
  // Ctrl + wheel up over the pin zooms in, and the pin stays under the pointer
  for (let i = 0; i < 2; i++) { await p.keyboard.down('Control'); await p.mouse.wheel(0, -100); await p.keyboard.up('Control'); await p.waitForTimeout(80); }
  await until(p, () => parseInt(document.querySelector('#plZoomReset').textContent, 10) > 200);
  const zoomed = parseInt(await zoomText(), 10);
  assert.ok(zoomed > 230 && zoomed <= 300, `zoomed to ${zoomed}%`);
  const after = await pin();
  assert.ok(Math.abs(after.x - before.x) < 6 && Math.abs(after.y - before.y) < 6, `the pin moved from ${JSON.stringify(before)} to ${JSON.stringify(after)}`);
  // Ctrl + wheel down zooms out again
  await p.keyboard.down('Control'); await p.mouse.wheel(0, 300); await p.keyboard.up('Control');
  await until(p, () => parseInt(document.querySelector('#plZoomReset').textContent, 10) < 200);
  // the + button zooms around the middle: the plan is not scrolled back to its top left corner
  await p.click('#plZoomReset'); for (let i = 0; i < 3; i++) await p.click('#plZoomIn');
  const scroll = await p.$eval('#plStage', s => [s.scrollLeft, s.scrollTop]);
  assert.ok(scroll[0] > 0 && scroll[1] > 0, `the plan was scrolled to ${scroll}, not kept at its middle`);

  // the relationship map zooms with Ctrl + wheel
  await go('map');
  await p.waitForSelector('#mapSvg');
  const mapZoom = () => p.evaluate(async () => (await import('/js/02-views.js')).MAP.zoom);
  const z0 = await mapZoom();
  const svg = await p.locator('#mapSvg').boundingBox();
  await p.mouse.move(svg.x + svg.width / 2, svg.y + svg.height / 2);
  await p.keyboard.down('Control'); await p.mouse.wheel(0, -100); await p.keyboard.up('Control');
  assert.ok(await mapZoom() > z0, 'the map did not zoom in');
  // the – 100% + control shows the zoom, and its buttons zoom too
  assert.equal((await p.textContent('#mapZoomReset')).trim(), Math.round(await mapZoom() * 100) + '%');
  await p.click('#mapZoomReset'); assert.equal(await mapZoom(), 1);
  await p.click('#mapZoomIn'); assert.equal((await p.textContent('#mapZoomReset')).trim(), '125%');
  await p.click('#mapZoomOut'); assert.equal((await p.textContent('#mapZoomReset')).trim(), '100%');

  // PC picked on the left, a search for the switch: every view says it is there, of another type
  await p.evaluate(async () => { const c = await import('/js/01-core.js'); c.st.type = 'pc'; c.st.q = '172.21.103.2'; document.querySelector('#search').value = c.st.q; });
  for (const tab of ['cards', 'table', 'map']) {
    await go(tab);
    await p.waitForSelector('#searchAllBtn');
    assert.match(await p.textContent('#view'), /Nothing matches “172\.21\.103\.2” within PC\. 1 object outside this type does: 172\.21\.103\.2/, tab);
    assert.equal(await p.locator('#newFromSearch').count(), 0, `${tab} offers to create what is already there`);
  }
  // "Search all objects" keeps the search, drops the type: the map shows the switch with its relation
  await p.click('#searchAllBtn');
  await p.waitForSelector('#mapSvg .mnode[data-id=s1]');
  assert.equal(await p.locator('#mapSvg .mnode[data-id=p2]').count(), 1, 'the PC linked to it is drawn too');
  assert.equal(await p.evaluate(async () => { const c = await import('/js/01-core.js'); return [c.st.type, c.st.q].join('|'); }), '|172.21.103.2');
  assert.equal(await p.inputValue('#search'), '172.21.103.2');

  assert.deepEqual(errors, []);
  console.log('view zoom and hidden search hits: all checks passed');
} finally { await browser.close(); server.close(); }
