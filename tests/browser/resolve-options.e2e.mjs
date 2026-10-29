/* Every way to resolve a probable duplicate, end to end: a dock (from the inventory and from To review), a shared dock at
   a desk, the same device, obsolete and not a duplicate. Each is saved, survives a reload from the server, and the next
   Lansweeper push brings no merged record back. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import { mergeRecords } from '../../server/feed.js';
import { until } from './until.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-resolve-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const day = new Date().toISOString().slice(0, 10);
const dev = (id, n, name, extra = {}) => ({ id, code: 'INV-' + String(n).padStart(4, '0'), type: 'notebook', name, status: 'active', feed: null, ...extra });
saveState(db, { ...loadState(db), feedOn: true,
  objs: [
    dev('a', 1, 'NB-35', { serial: 'S35', ip: '10.1.2.35' }), dev('a2', 2, 'nb-35.corp.example', { ip: '10.1.2.135', mac: '64:c9:01:00:00:35', feed: { sys: 'Lansweeper', ref: 'L35' } }),
    dev('b', 3, 'NB-40', { serial: 'S40' }), dev('b2', 4, 'nb-40.corp.example', { ip: '10.1.2.140' }),
    dev('c', 5, 'NB-41', { serial: 'S41' }), dev('c2', 6, 'nb-41.corp.example', { ip: '10.1.2.141' }),
    dev('d', 7, 'NB-42', { serial: 'S42' }), dev('d2', 8, 'nb-42.corp.example', { ip: '10.1.2.142', mac: '64:c9:01:00:00:42' }),
    dev('e', 9, 'NB-43', { serial: 'S43' }), dev('e2', 10, 'nb-43.corp.example', { ip: '10.1.2.143', mac: '64:c9:01:00:00:43', review: { src: 'lansweeper', at: day + ' 08:00' } }),
    dev('f', 11, 'PC-7', { serial: 'P7', type: 'pc' }), dev('f2', 12, 'PC-7', { type: 'pc', ip: '10.1.4.7', model: 'HP 800', review: { src: 'lansweeper', at: day + ' 08:00' } }),
    dev('sw', 13, 'SW-1', { type: 'switch', ports: 24 }), dev('sv', 14, 'SRV-1', { type: 'server', serial: 'SV1' }),
  ], rels: [{ id: 'p5', from: 'sv', to: 'sw', kind: 'connected', port: 5, vlan: null }, { id: 'p6', from: 'sv', to: 'sw', kind: 'connected', port: 6, vlan: null }], history: {} });

const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
const stored = async (check, ms = 8000) => { const t0 = Date.now(); while (!check(loadState(db))) { if (Date.now() - t0 > ms) throw new Error('not saved in time'); await new Promise(r => setTimeout(r, 100)); } };
const obj = (st, id) => st.objs.find(o => o.id === id);
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch { /* none */ } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const resolve = async (id, way, label) => {
    await p.evaluate(async i => (await import('/js/15-review.js')).resolveModal([(await import('/js/01-core.js')).byId(i)]), id);
    await p.waitForSelector('[name=dupWay]');
    await p.check(`[name=dupWay][value=${way}]`);
    assert.equal((await p.textContent('#dupOk')).trim(), label);
    await p.click('#dupOk');
  };

  // dock, from the inventory: an attachment of NB-35 by its MAC, the record kept as ignored
  await resolve('a2', 'dock', 'Add as attachment');
  await stored(st => obj(st, 'a2').review?.merged === 'a' && obj(st, 'a2').excluded && (obj(st, 'a').accessories || [])[0]?.mac === '64:c9:01:00:00:35');
  assert.equal(obj(loadState(db), 'a').nics, undefined);
  // dock, from To review
  await resolve('e2', 'dock', 'Add as attachment');
  await stored(st => obj(st, 'e2').review?.merged === 'e' && obj(st, 'e2').review.ignored && (obj(st, 'e').accessories || [])[0]?.seenAs === 'nb-43.corp.example');
  // shared dock at a desk
  await resolve('d2', 'desk', 'Keep as dock');
  await stored(st => obj(st, 'd2').notTwin && obj(st, 'd2').type === 'other' && obj(st, 'd2').purpose === 'Docking station' && !obj(st, 'd').accessories);
  // the same device: fills the empty fields, Undo puts all back
  await resolve('f2', 'same', 'Merge');
  await stored(st => obj(st, 'f2').review?.merged === 'f' && obj(st, 'f').model === 'HP 800' && (obj(st, 'f').nics || []).some(n => n.ip === '10.1.4.7'));
  await p.click('#toast .t-undo');
  await stored(st => !obj(st, 'f2').review.merged && !obj(st, 'f').model && !obj(st, 'f').nics);
  await resolve('f2', 'same', 'Merge');
  await stored(st => obj(st, 'f2').review?.merged === 'f');
  // obsolete: retired and excluded
  await resolve('c2', 'obsolete', 'Retire');
  await stored(st => obj(st, 'c2').status === 'retired' && obj(st, 'c2').excluded);
  // not a duplicate
  await resolve('b2', 'notdup', 'Keep both');
  await stored(st => obj(st, 'b2').notTwin === true);

  // after a reload from the server: merged records sit in To review's ignored list, the rest in the inventory, and nothing
  // is flagged as a duplicate any more
  await p.reload(); await until(p, async () => (await import('/js/01-core.js')).objs.length > 0);
  const where = await p.evaluate(async () => { const c = await import('/js/01-core.js');
    return { review: c.REVIEW.map(o => o.id).sort(), inv: c.objs.map(o => o.id).sort(), twins: [...c.objs, ...c.REVIEW].filter(o => c.twinOf(o)).map(o => o.id) }; });
  assert.deepEqual(where.review, ['a2', 'e2', 'f2']);
  assert.deepEqual(where.inv, ['a', 'b', 'b2', 'c', 'c2', 'd', 'd2', 'e', 'f', 'sv', 'sw']);
  assert.deepEqual(loadState(db).rels.map(r => r.id).sort(), ['p5', 'p6'], 'parallel links elsewhere are left alone by every merge');
  assert.deepEqual(where.twins, [], 'nothing left to resolve');
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('a'));
  await p.waitForSelector('.nics.merged');
  assert.match(await p.textContent('.ctlrow.entries'), /Docking station[\s\S]*64:c9:01:00:00:35[\s\S]*as nb-35\.corp\.example/);

  // the next push: the merged records are excluded, so none comes back as a device
  const s = loadState(db);
  const counts = mergeRecords(s, [{ name: 'nb-35.corp.example', serial: '', ip: '10.1.2.199', mac: '64:c9:01:00:00:35', ref: 'L35' }, { name: 'nb-43.corp.example', serial: '', ip: '10.1.2.198', ref: 'L43' }], new Date());
  assert.equal(counts.created, 0); assert.equal(counts.excluded, 2);
  assert.equal(s.objs.length, 14);
  // Back to review on a merged record takes it out of its device too, like Unmerge
  await p.evaluate(async () => (await import('/js/15-review.js')).reviewDo('restore', [(await import('/js/01-core.js')).byId('a2')]));
  await stored(st => !obj(st, 'a2').review.merged && !obj(st, 'a2').excluded && !obj(st, 'a').accessories);
  // a dock merged into a device that itself waits in To review: Unmerge takes the attachment off it again
  await p.evaluate(async () => { const c = await import('/js/01-core.js');
    c.REVIEW.push({ id: 'g', code: 'INV-0020', type: 'notebook', name: 'NB-60', serial: 'S60', status: 'active', feed: null, review: { src: 'ad', at: 'x' } });
    c.objs.push({ id: 'g2', code: 'INV-0021', type: 'notebook', name: 'nb-60.corp.example', mac: '64:c9:01:00:00:60', status: 'active', feed: null });
    (await import('/js/07-render.js')).render(); });
  await resolve('g2', 'dock', 'Add as attachment');
  await stored(st => (obj(st, 'g') || {}).accessories?.length === 1 && obj(st, 'g2').review?.merged === 'g');
  await p.evaluate(async () => (await import('/js/02-views.js')).openObj('g'));
  await p.waitForSelector('[data-unmerge="g2"]'); await p.click('[data-unmerge="g2"]');
  await stored(st => !obj(st, 'g').accessories && !obj(st, 'g2').review.merged);

  assert.deepEqual(errors, []);
  console.log('resolve options: all checks passed');
} finally { await browser.close(); server.close(); }
