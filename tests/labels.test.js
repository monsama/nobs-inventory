/* Labels with a QR code: made from the inventory for the devices picked, on a sheet or for a label printer; the QR
   code holds the device's address in the inventory. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState } from '../server/state.js';
import { labelLink, labelsPdf, LABEL_FORMATS } from '../server/labels.js';
import { setPassword } from '../server/auth.js';

test('a label links to its device by inventory number, or by id without one', () => {
  assert.equal(labelLink('https://inv.example/', { id: 'o1', code: 'INV-0001' }), 'https://inv.example/?o=INV-0001');
  assert.equal(labelLink('https://inv.example/nobs', { id: 'o 2', code: '' }), 'https://inv.example/nobs/?o=o%202');
});

test('labels as a PDF in every format, a partly used sheet skipped', async () => {
  const devs = [{ id: 'a', code: 'INV-1', name: 'NB-1', serial: 'S1' }, { id: 'b', code: 'INV-2', name: 'Łukasz', serial: '' }];
  for (const format of Object.keys(LABEL_FORMATS)) {
    const pdf = await labelsPdf(devs, { format, base: 'https://inv.example', skip: 5 });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', format);
  }
});

test('labels from the server: for anyone signed in, from what the inventory holds', async () => {
  const srv = await startServer();
  try {
    const s = loadState(srv.db);
    saveState(srv.db, { ...s, users: [...s.users, { id: 'u-v', login: 'viewer', name: 'Vera', role: 'viewer', source: 'manual', active: true, groups: [] }],
      objs: [{ id: 'o1', code: 'INV-0001', type: 'pc', name: 'PC-1', serial: 'SN1', status: 'active', loc: '', ovr: {}, feed: null },
        { id: 'r1', code: 'INV-0002', type: 'pc', name: 'WAITING', status: 'active', loc: '', ovr: {}, feed: null, review: { src: 'ad', at: 'x' } }] });
    setPassword(srv.db, 'u-v', 'viewerpass123');
    const v = await signIn(srv, 'viewer', 'viewerpass123');
    const ok = await fetch(`${srv.base}/api/labels`, { method: 'POST', headers: { cookie: v.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ids: ['o1', 'nope'], format: 'roll-62x29' }) });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'application/pdf');
    const none = await srv.call('POST', '/api/labels', { cookie: v.cookie, body: { ids: ['r1'] } });
    assert.equal(none.status, 400, 'a record waiting in To review gets no label');
    assert.equal((await srv.call('POST', '/api/labels', { cookie: v.cookie, body: {} })).status, 400);
    assert.equal((await srv.call('POST', '/api/labels', { body: { ids: ['o1'] } })).status, 401);
  } finally { await srv.close(); }
});
