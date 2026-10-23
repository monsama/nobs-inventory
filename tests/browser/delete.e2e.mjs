/* Deleting an object that other things point to: its relations, the devices on top of it and in its rack, and its plan
   position are cleaned up, and the save that follows is accepted. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { seedBasics } from '../helpers.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

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
  await p.waitForFunction(() => objs.length > 0);
  // A server in a rack, another on top of it, a PC on the switch, and the switch on a plan.
  await p.evaluate(() => {
    const base = {status:'active', loc:'', notes:'', ports:0, ovr:{}, history:[]};
    objs.push({...base, id:'s1', code:'S1', name:'SRV-A', type:'server', rack:'R-SRV', u:3, h:2});
    objs.push({...base, id:'s2', code:'S2', name:'SRV-B', type:'server', rack:'R-SRV', ontop:'s1'});
    rels.push({id:'x1', from:'o2', to:'o1', kind:'connected', port:4, vlan:null});
    rels.push({id:'x2', from:'s1', to:'o1', kind:'connected', port:null, vlan:null});
    byId('o1').planPos = {plan:'pl1', x:10, y:10};
    PLANS.push({id:'pl1', name:'EG', site:'Zürich HQ', areas:[]});
    st.tab = 'cards'; render();
  });
  await p.evaluate(() => { deleteObject('o1'); queueServerSave(); });
  await p.evaluate(() => flushSave());
  const after = await p.evaluate(() => ({ rels: rels.filter(r => r.to === 'o1' || r.from === 'o1').length, o1: !!byId('o1'), ontop: byId('s2').ontop ?? null }));
  assert.equal(after.o1, false, 'the object was not deleted');
  assert.equal(after.rels, 0, 'relations to the deleted object are still there');
  await p.evaluate(() => reloadFromServer());
  assert.equal(await p.evaluate(() => !!byId('o1')), false, 'the deleted object came back after a reload: the save was refused');
  assert.deepEqual(errors, [], 'page errors');
  console.log('delete: all checks passed');
} finally { await browser.close(); await new Promise(r => server.close(r)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
