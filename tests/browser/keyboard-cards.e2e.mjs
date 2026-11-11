/* Cards, To review and the device page from the keyboard, and the filter drawer on a phone:
   - a card's name opens the device (Enter), its corner tick selects it (Enter or Space) and says so (aria-pressed);
   - Accept on a card in To review is a button that Enter presses;
   - the device page's source tabs: Tab reaches only the chosen one, the arrow keys move between them;
   - on a phone the filter drawer closes on Escape and on a tap beside it. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { until, storedBy } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-keys-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const day = new Date().toISOString().slice(0, 10);
saveState(db, { ...loadState(db),
  objs: [
    { id: 'p1', code: 'INV-0001', type: 'pc', name: 'PC-1', serial: 'S1', status: 'active', feed: { sys: 'Lansweeper', ref: '1' } },
    { id: 'p2', code: 'INV-0002', type: 'pc', name: 'PC-2', serial: 'S2', status: 'active', feed: { sys: 'Lansweeper', ref: '2', seen: day }, ad: { name: 'PC-2', seen: day } },
    { id: 'r8', code: 'INV-0003', type: 'pc', name: 'PC-8', serial: 'S8', status: 'active', feed: null, review: { src: 'lansweeper', at: day + ' 08:00' } },
  ],
  rels: [], history: {} });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const signIn = async p => {
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage(); await signIn(p);
  await p.click('#tabsbar [data-tab=cards]'); await p.waitForSelector('#cards .card[data-open="p2"]');

  // 1. Cards: no card is one big toggle button any more; the tick selects, the name opens
  assert.equal(await p.locator('#cards button.card, #cards .card[aria-pressed]').count(), 0, 'a card is still a toggle button');
  const tick = '#cards .card[data-open="p2"] .cardtick';
  assert.equal(await p.getAttribute(tick, 'aria-pressed'), 'false');
  await p.focus(tick); await p.keyboard.press('Enter');
  await p.waitForSelector('#cards .card.picked[data-open="p2"]');
  assert.equal(await p.getAttribute(tick, 'aria-pressed'), 'true', 'the tick does not say it is selected');
  await p.keyboard.press('Escape');
  await until(p, async () => !(await import('/js/01-core.js')).st.bulk?.size);
  await p.focus('#cards .card[data-open="p2"] .card-open'); await p.keyboard.press('Enter');
  await until(p, async () => (await import('/js/01-core.js')).st.tab === 'p2');

  // 2. The device page's source tabs: one stop for Tab, the arrow keys move
  const tabs = '#view [data-srctab]';
  await p.waitForSelector(tabs);
  {
    assert.ok(await p.locator(tabs).count() > 1, 'no source tabs on a device with Lansweeper and AD');
    assert.equal(await p.locator(`${tabs}[tabindex="0"]`).count(), 1, 'more than one source tab is a Tab stop');
    await p.focus(`${tabs}[tabindex="0"]`); const first = await p.evaluate(() => document.activeElement.dataset.srctab);
    await p.keyboard.press('ArrowRight');
    const next = await p.evaluate(() => document.activeElement.dataset.srctab);
    assert.notEqual(next, first, 'the arrow key did not move to the next tab');
    assert.equal(await p.getAttribute(`[data-srctab="${next}"]`, 'aria-selected'), 'true');
    assert.equal(await p.getAttribute(`[data-srctab="${next}"]`, 'tabindex'), '0', 'the chosen tab is not the Tab stop');
  }

  // 3. To review: Accept is a button, and Enter on it accepts
  await p.click('#tabsbar [data-tab=review]'); await p.waitForSelector('#cards .card[data-open="r8"] [data-rvc="accept"]');
  assert.equal(await p.locator('#cards [data-rvc][role=button]').count(), 0, 'a review action is still a span');
  await p.focus('#cards .card[data-open="r8"] button[data-rvc="accept"]'); await p.keyboard.press('Enter');
  await storedBy(() => loadState(db), s => !s.objs.find(o => o.id === 'r8').review);
  await ctx.close();

  // 4. Phone: the filter drawer closes on Escape and on a tap beside it
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const m = await phone.newPage(); await signIn(m);
  const open = () => m.evaluate(() => document.body.classList.contains('side-open'));
  await m.click('#sideBtn'); assert.equal(await open(), true, 'the drawer did not open');
  await m.keyboard.press('Escape'); assert.equal(await open(), false, 'Escape left the drawer open');
  await m.click('#sideBtn'); assert.equal(await open(), true);
  await m.mouse.click(380, 600); assert.equal(await open(), false, 'a tap beside it left the drawer open');
  await phone.close();
  assert.deepEqual(errors, [], 'page errors');
  console.log('keyboard and cards: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
