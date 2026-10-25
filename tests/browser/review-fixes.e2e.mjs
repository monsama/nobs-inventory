/* Browser test of the fixes from the October review: viewers keep looking tools, a device without a location keeps none,
   a patch panel port is saved as P04, a new switch has no undefined SFP, the focused relations map keeps its boxes on a drag,
   and a floor plan area takes only clicks on itself and follows the pointer when dragged. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { setPassword } from '../../server/auth.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-rev-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const s = loadState(db);
s.objs.push({ id: 'o9', code: 'INV-0009', type: 'patch', name: 'PP-01', status: 'active', ovr: {}, feed: null, loc: s.objs[0].loc, ports: 24 });
s.objs.push({ id: 'o10', code: 'INV-0010', type: 'pc', name: 'NOLOC-PC', status: 'active', ovr: {}, feed: null, loc: '' });
s.objs.find(o => o.id === 'o2').software = [{ name: 'Chrome', version: '1' }];
s.users.push({ id: 'u-viewer', login: 'viewer', name: 'Viewer', dept: '', groups: [], source: 'manual', active: true, role: 'viewer' });
s.plans = [{id: 'pl1', name: 'EG', site: 'Zürich HQ', areas: [{id: 'ar1', name: 'Hall', x: 10, y: 10, w: 20, h: 20, rects: [{x: 10, y: 10, w: 20, h: 20}]}]}];
if (!s.locs.includes('Zürich HQ / Lager')) s.locs.push('Zürich HQ / Lager');
saveState(db, s); setPassword(db, 'u-viewer', 'viewerpass123');
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
async function login(u, pw){
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('ni-started', '1'));
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(u + ': ' + e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', u); await p.fill('#lgPw', pw); await p.click('#lgOk');
  await p.waitForFunction(() => /Admin|Viewer/.test(document.querySelector('#whoBtn').textContent));
  await p.waitForTimeout(300);
  return p;
}
const ev = (p, f, a) => p.evaluate(f, a);
const mods = `const c = await import('/js/01-core.js'), r = await import('/js/07-render-plans.js'), v = await import('/js/02-views.js');`;
try {
  const v = await login('viewer', 'viewerpass123');
  await v.click('[data-tab=sw]'); await v.waitForTimeout(200);
  assert.equal(await v.isDisabled('#swQ'), false, 'a viewer can search software'); assert.equal(await v.locator('.sw-tg').first().isDisabled(), false, 'a viewer can open a package');
  await v.click('[data-tab=plans]'); await v.waitForTimeout(200);
  for (const id of ['#plQ', '#plZoomIn', '#plSel']) if (await v.locator(id).count()) assert.equal(await v.isDisabled(id), false, 'a viewer can use ' + id);
  for (const id of ['#plNew', '#plDel']) if (await v.locator(id).count()) assert.equal(await v.isDisabled(id), true, 'a viewer cannot use ' + id);
  await v.click('#setBtn'); await v.click('#setTabs [data-st=types]'); await v.waitForTimeout(200);
  assert.equal(await v.isDisabled('#tfType'), false, 'a viewer can look at another type\'s fields');
  await v.click('#setTabs [data-st=locations]'); await v.waitForTimeout(200);
  assert.equal(await v.isDisabled('#nsName'), true, 'a viewer cannot add a site');
  await v.keyboard.press('Escape');

  const a = await login('admin', 'adminpass123');
  // icon labels
  await a.click('#setBtn'); await a.click('#setTabs [data-st=types]'); await a.waitForTimeout(200);
  assert.ok((await a.locator('.icondd-list').first().locator('.icondd-item span').allTextContents()).includes('PLC / Controller'), 'the PLC icon has a name');
  await a.click('#setTabs [data-st=users]'); await a.waitForTimeout(200);
  assert.match(await a.getAttribute('#nuPw', 'placeholder'), /min\. 12/, 'the password hint gives the real minimum');
  await a.click('#setClose');
  // loc '' object page
  await ev(a, async () => { const v = await import('/js/02-views.js'); const c = await import('/js/01-core.js'); v.openObj(c.byName('NOLOC-PC').id); });
  await a.waitForTimeout(200);
  assert.equal(await a.locator('[data-k=loc]').inputValue(), '', 'no location is shown as none');
  await a.fill('[data-k=purpose]', 'Kiosk'); await a.locator('[data-k=purpose]').press('Tab'); await a.waitForTimeout(200);
  assert.equal(await ev(a, async () => (await import('/js/01-core.js')).byName('NOLOC-PC').loc), '', 'saving another field moved the device to a room');
  // new object into patch panel port 4
  await a.click('#newBtn'); await a.fill('#nName', 'PP-TEST-PC'); await a.selectOption('#nUp', 'o9'); await a.fill('#nPort', '4'); await a.click('#nOk'); await a.waitForTimeout(300);
  assert.equal(await ev(a, async () => { const c = await import('/js/01-core.js'); const o = c.byName('PP-TEST-PC'); return c.rels.find(r => r.from === o.id).port; }), 'P04', 'the patch panel port is saved as the panel names it');
  // type change pc -> switch
  await ev(a, async () => { const v = await import('/js/02-views.js'); const c = await import('/js/01-core.js'); v.openObj(c.byName('ZH-PC-0142').id); });
  await a.waitForTimeout(200);
  await a.selectOption('[data-k=type]', 'switch'); await a.waitForTimeout(300);
  await a.click('[data-tab=cards]'); await a.waitForTimeout(200);
  assert.ok(!(await a.locator('.card', {hasText: 'ZH-PC-0142'}).textContent()).includes('undefined'), 'the switch card shows no undefined');
  await a.click('[data-tab=rack]'); await a.waitForTimeout(200);
  // map focus drag
  await ev(a, async () => { const c = await import('/js/01-core.js'); c.rels.push({id:'rx1', from:'o2', to:'o1', kind:'connected', port: 3}, {id:'rx2', from:'o5', to:'o1', kind:'connected', port: 5}, {id:'rx3', from:'o4', to:'o3', kind:'attached', port:null}); c.st.mapAttached = true; });
  await a.click('[data-tab=map]'); await a.waitForTimeout(300);
  await a.selectOption('#mapFocus', 'o2'); await a.waitForTimeout(400);
  const before = await a.locator('.mnode').count();
  const nb = await a.locator('.mnode').first().boundingBox();
  await a.mouse.move(nb.x + 50, nb.y + 30); await a.mouse.down(); await a.mouse.move(nb.x + 120, nb.y + 80, {steps: 5}); await a.mouse.up(); await a.waitForTimeout(200);
  assert.equal(await a.locator('.mnode').count(), before, 'a drag in the focused map brought in other boxes');
  // plans: click outside the area in view mode
  await a.click('[data-tab=plans]'); await a.waitForTimeout(300);
  const cb = await a.locator('#plCanvas').boundingBox();
  assert.equal(await ev(a, ([x, y]) => !!document.elementFromPoint(x, y).closest('[data-area-drag]'), [cb.x + cb.width * .8, cb.y + cb.height * .8]), false, 'an empty part of the plan is taken by an area');
  await a.mouse.click(cb.x + cb.width * .8, cb.y + cb.height * .8); await a.waitForTimeout(200);
  assert.equal(await a.locator('#plAreaAdd').count(), 0, 'a click outside the area selected it');
  // area drag preview: drag area from 20,20 by +10,+0, sample svg left mid-drag
  await a.mouse.move(cb.x + cb.width * .2, cb.y + cb.height * .2); await a.mouse.down(); await a.mouse.move(cb.x + cb.width * .3, cb.y + cb.height * .2, {steps: 4});
  const r = await a.locator('[data-area-drag] .pl-area-edge').first().boundingBox();
  assert.ok(Math.abs((r.x - cb.x) / cb.width * 100 - 20) < 1.5, 'the area does not follow the pointer: ' + ((r.x - cb.x) / cb.width * 100).toFixed(1));
  await a.mouse.up(); await a.waitForTimeout(200);
  assert.deepEqual(errors, [], 'no page errors');
  console.log('review fixes: all checks passed');
} finally { await browser.close(); server.close(); }
