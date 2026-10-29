/* Deleting an object that other things point to: its relations, the devices on top of it and in its rack, and its plan
   position are cleaned up, and the save that follows is accepted. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { until } from './until.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-delete-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
seedBasics(db);
const server = await new Promise(r => { const s = createApp({ db }).listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('#lgUser');
  await p.fill('#lgUser', 'admin'); await p.fill('#lgPw', 'adminpass123'); await p.click('#lgOk');
  await until(p, async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (__mods[0].objs.length > 0); });
  // A server in a rack, another on top of it, a PC on the switch, and the switch on a plan.
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js'), import('/js/07-render.js')]);
    const base = {status:'active', loc:'', notes:'', ports:0, ovr:{}, history:[]};
    __mods[0].objs.push({...base, id:'s1', code:'S1', name:'SRV-A', type:'server', rack:'R-SRV', u:3, h:2});
    __mods[0].objs.push({...base, id:'s2', code:'S2', name:'SRV-B', type:'server', rack:'R-SRV', ontop:'s1'});
    __mods[0].rels.push({id:'x1', from:'o2', to:'o1', kind:'connected', port:4, vlan:null});
    __mods[0].rels.push({id:'x2', from:'s1', to:'o1', kind:'connected', port:null, vlan:null});
    __mods[0].byId('o1').planPos = {plan:'pl1', x:10, y:10};
    __mods[0].PLANS.push({id:'pl1', name:'EG', site:'Zürich HQ', areas:[]});
    __mods[0].st.tab = 'cards'; __mods[1].render();
  });
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/03-object-modals.js'), import('/js/07-render.js')]); __mods[0].deleteObject('o1'); __mods[1].queueServerSave(); });
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/07-render.js')]); return (__mods[0].flushSave()); });
  const after = await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return ({ rels: __mods[0].rels.filter(r => r.to === 'o1' || r.from === 'o1').length, o1: !!__mods[0].byId('o1'), ontop: __mods[0].byId('s2').ontop ?? null }); });
  assert.equal(after.o1, false, 'the object was not deleted');
  assert.equal(after.rels, 0, 'relations to the deleted object are still there');
  await p.evaluate(async () => { const __mods = await Promise.all([import('/js/07-render.js')]); return (__mods[0].reloadFromServer()); });
  assert.equal(await p.evaluate(async () => { const __mods = await Promise.all([import('/js/01-core.js')]); return (!!__mods[0].byId('o1')); }), false, 'the deleted object came back after a reload: the save was refused');
  assert.deepEqual(errors, [], 'page errors');
  console.log('delete: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
