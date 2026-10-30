/* Settings → Data sources is drawn from public/js/sync-map.js, and the syncs read their field lists from it too: these
   checks keep the two from drifting apart. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AD_FILL, GRAPH_FILL, LS_FIELDS, ORDER_FIELDS, SOURCE_EXTRAS, SOURCE_LABEL, SYNC_FIELD_LABEL, fieldOrder, fieldOrderProblem, maySet } from '../public/js/sync-map.js';
import { mergeRecords } from '../server/feed.js';

test('every field a sync writes has a name on the page, and every source on the page has a name', () => {
  for (const k of [...LS_FIELDS, ...Object.keys(GRAPH_FILL), ...Object.keys(AD_FILL)]) assert.ok(SYNC_FIELD_LABEL[k], `no label for ${k}`);
  for (const src of Object.keys(SOURCE_EXTRAS)) assert.ok(SOURCE_LABEL[src], `no name for ${src}`);
});

test('Lansweeper writes exactly the fields the page lists for it', () => {
  const sample = { ip: '10.0.0.5', ip6: 'fe80::1', patch: '2026-10-01', mac: '00:11:22:33:44:55', os: 'Windows 11', model: 'HP 800', cpu: 'i5', ram: '16 GB', fw: '1.2', boot: '2026-10-28',
    disk: 'C: 100/200 GB', av: 'Defender', domain: 'corp.example', mask: '255.255.255.0', gateway: '10.0.0.1', dns: '10.0.0.2', dhcp: 'dhcp', purchased: '2026-01-01', warranty: '2029-01-01' };
  assert.deepEqual(Object.keys(sample).sort(), [...LS_FIELDS].sort(), 'the sample covers the list');
  const s = { objs: [{ id: 'o1', code: 'INV-0001', name: 'PC-1', serial: 'S1', status: 'active', type: 'pc', feed: { sys: 'Lansweeper', ref: '1' } }], rels: [], users: [], locs: [], history: {},
    policy: Object.fromEntries(LS_FIELDS.map(k => [k, true])), feedOn: true };
  mergeRecords(s, [{ name: 'PC-1', serial: 'S1', ref: '1', ...sample }], new Date('2026-10-29T10:00:00Z'));
  const o = s.objs[0];
  for (const k of LS_FIELDS) assert.ok(o[k], `Lansweeper did not write ${k}`);
});

test('location texts: Lansweeper by its room or mapping, kept for Settings; purchase data fills empty fields only', async () => {
  const { priceOf, officeLocations } = await import('../server/fill.js');
  assert.deepEqual(["1'234.50", '1.234,50', '1234,5', 'CHF 980.-', '980', '1,234', 'n/a', ''].map(priceOf), [1234.5, 1234.5, 1234.5, 980, 980, 1234, null, null]);
  const s = { objs: [{ id: 'o1', code: 'INV-0001', name: 'PC-1', serial: 'S1', status: 'active', type: 'pc', feed: { sys: 'Lansweeper', ref: '1' }, supplier: 'Typed by hand' }],
    rels: [], users: [], locs: ['Bern / EG', 'Bern / Lager'], locMap: { 'HQ / Lager hinten': 'Bern / Lager' }, history: {}, policy: { loc: true }, feedOn: true };
  mergeRecords(s, [{ name: 'PC-1', serial: 'S1', ref: '1', location: 'HQ / Lager hinten', price: "1'299.00", supplier: 'Shop AG', invoice: 'PO-4711' },
    { name: 'PC-2', serial: 'S2', ref: '2', location: 'Somewhere else', price: '450' }], new Date('2026-10-29T10:00:00Z'));
  const [a, b] = s.objs;
  assert.equal(a.loc, 'Bern / Lager', 'mapped in Settings → Locations');
  assert.equal(a.feed.location, 'HQ / Lager hinten', 'the text is kept, to be used');
  assert.deepEqual([a.price, a.supplier, a.invoice], [1299, 'Typed by hand', 'PO-4711'], 'what a person typed stays');
  assert.equal(b.loc, '', 'free text never becomes a location'); assert.equal(b.feed.location, 'Somewhere else'); assert.equal(b.price, 450);
  // the office of a device's user, only with the option on
  const t = { objs: [{ id: 'd', name: 'NB-1', status: 'active', uid: 'u1' }], users: [{ id: 'u1', name: 'Anna Muster', profile: { office: 'Bern EG', from: 'ldap' } }], locs: ['Bern / EG'], locMap: { 'Bern EG': 'Bern / EG' }, history: {} };
  assert.equal(officeLocations(t, 'x'), 0, 'off by default'); assert.equal(t.objs[0].loc, undefined);
  t.locFromOffice = true;
  assert.equal(officeLocations(t, 'x'), 1); assert.equal(t.objs[0].loc, 'Bern / EG'); assert.equal(t.objs[0].src.loc, 'ad');
});

test('AD: "managed by" sets the internal responsible when a contact has that name and the device has none', async () => {
  const { applyComputers } = await import('../server/ldap-sync.js');
  const s = { objs: [{ id: 'a', name: 'PC-A', status: 'active' }, { id: 'b', name: 'PC-B', status: 'active', respIn: 'k2' }], rels: [], users: [], locs: [], history: {},
    contacts: [{ id: 'k1', kind: 'internal', name: 'Viktor Hug' }, { id: 'k2', kind: 'internal', name: 'Other Person' }] };
  const comp = name => ({ name, dns: name.toLowerCase() + '.corp.example', groups: [], os: '', domain: '', logon: '2026-10-22', created: '', managedBy: 'viktor hug' });
  applyComputers(s, [comp('PC-A'), comp('PC-B')], new Date('2026-10-29T10:00:00Z'));
  assert.equal(s.objs[0].respIn, 'k1'); assert.equal(s.objs[1].respIn, 'k2', 'one already set stays');
});

test('the order of a field\'s sources: the default as before, set per field, with the source picked on a device first', async () => {
  const { fillField } = await import('../server/fill.js');
  const at = '2026-10-29 10:00';
  // without a set order: Lansweeper while the policy lets it, then Intune, then AD; purchase data is Lansweeper's
  assert.deepEqual(fieldOrder({ policy: { os: true } }, 'os'), ['ls', 'graph', 'ad']);
  assert.deepEqual(fieldOrder({ policy: { os: false } }, 'os'), ['graph', 'ad']);
  assert.deepEqual(fieldOrder({}, 'price'), ['ls']);
  assert.deepEqual(fieldOrder({ policy: {}, fieldOrder: { os: ['ad', 'graph'] } }, 'os'), ['ad', 'graph']);
  assert.deepEqual(ORDER_FIELDS.slice().sort(), Object.keys(SYNC_FIELD_LABEL).sort(), 'every field on the page has its sources');
  // AD first: it replaces Intune's value, and Intune no longer replaces AD's
  const s = { policy: {}, fieldOrder: { os: ['ad', 'graph'] }, history: {} };
  const o = { id: 'o1', os: 'Windows 11 (Intune)', src: { os: 'graph' } };
  assert.equal(fillField(s, o, 'os', 'Windows 11 Pro', 'ad', at, 'Operating system'), true);
  assert.equal(fillField(s, o, 'os', 'Windows 11 (Intune)', 'graph', at, 'Operating system'), false);
  assert.deepEqual([o.os, o.src.os], ['Windows 11 Pro', 'ad']);
  // a source left out only shows its value, and gives way to one in the order
  s.fieldOrder.os = ['graph'];
  assert.equal(maySet(s, o, 'os', 'ad'), false);
  assert.equal(fillField(s, o, 'os', 'Windows 11 (Intune)', 'graph', at), true);
  // a value set by hand, or another source picked on the device, wins over every order
  o.pick = { os: 'hand' };
  assert.equal(fillField(s, o, 'os', 'Windows 12', 'graph', at), false);
  // without a set order, a source's value stays as before: AD never replaces Intune, Intune not Lansweeper's first value
  assert.equal(maySet({ policy: {} }, { os: 'x', src: { os: 'graph' } }, 'os', 'ad'), false);
  assert.equal(maySet({ policy: {} }, { disk: 'x', src: { disk: 'ls' } }, 'disk', 'graph'), false);
  // on a device linked to Lansweeper, a field it comes before Intune for is left to it once it has a value
  assert.equal(maySet({ policy: { os: true } }, { os: 'x', src: { os: 'graph' }, feed: { sys: 'Lansweeper' } }, 'os', 'graph'), false);
  // what may be saved
  assert.equal(fieldOrderProblem({ os: ['ad', 'graph', 'ls'], price: [] }), '');
  for (const bad of [[], { os: ['ad', 'ad'] }, { os: ['x'] }, { purpose: ['graph'] }, { nofield: [] }, { os: 'ad' }]) assert.ok(fieldOrderProblem(bad), JSON.stringify(bad));
});

test('Lansweeper follows the order too: out of it, it only shows its value; after Intune, it fills empty fields only', () => {
  const dev = extra => ({ id: 'o1', code: 'INV-0001', name: 'PC-1', serial: 'S1', status: 'active', type: 'pc', feed: { sys: 'Lansweeper', ref: '1' }, ...extra });
  const push = (s, r) => mergeRecords(s, [{ name: 'PC-1', serial: 'S1', ref: '1', ...r }], new Date('2026-10-29T10:00:00Z'));
  const base = { rels: [], users: [], locs: [], history: {}, feedOn: true, policy: { ip: true, os: true } };
  // out of the order (Shown only), though "Feed may overwrite" says yes: the value is shown beside the field, not written
  const a = { ...base, fieldOrder: { ip: [] }, objs: [dev({ ip: '10.0.0.1', src: { ip: 'ls' } })] };
  push(a, { ip: '10.0.0.9' });
  assert.equal(a.objs[0].ip, '10.0.0.1'); assert.equal(a.objs[0].vals.ip.ls[0], '10.0.0.9');
  // after Intune: Intune's value stays, an empty field is filled
  const b = { ...base, fieldOrder: { os: ['graph', 'ls'], model: ['graph', 'ls'] }, objs: [dev({ os: 'Windows 11 (Intune)', src: { os: 'graph' } })] };
  push(b, { os: 'Windows 11 Pro', model: 'HP 800' });
  assert.deepEqual([b.objs[0].os, b.objs[0].model, b.objs[0].src.model], ['Windows 11 (Intune)', 'HP 800', 'ls']);
  // purchase data out of the order is not filled
  const c = { ...base, fieldOrder: { price: [] }, objs: [dev({})] };
  push(c, { price: '100', supplier: 'Shop AG' });
  assert.deepEqual([c.objs[0].price, c.objs[0].supplier], [undefined, 'Shop AG']);
});

test('a monitor Lansweeper sees on a dock hangs on the device the dock was merged into, and stays there', () => {
  const at = new Date('2026-10-30T07:00:00Z');
  const pc = { id: 'pc', code: 'INV-0001', name: 'NB-7', serial: 'S7', status: 'active', type: 'pc', feed: { sys: 'Lansweeper', ref: 'nb7' } };
  const dock = { id: 'dk', code: 'INV-0002', name: 'nb-7.corp.example', status: 'active', type: 'pc', feed: { sys: 'Lansweeper', ref: 'dk7' }, excluded: true, review: { src: 'lansweeper', at: 'x', ignored: 'x', merged: 'pc' } };
  const mon = { id: 'mo', code: 'INV-0003', name: 'Dell P2422H', serial: 'M1', status: 'active', type: 'monitor', feed: { sys: 'Lansweeper', ref: 'm1' } };
  const s = { objs: [pc, dock, mon], rels: [{ id: 'r0', from: 'mo', to: 'dk', kind: 'attached', port: null, vlan: null, src: 'Lansweeper' }], users: [], locs: [], history: {}, feedOn: true, policy: {} };
  // the monitor says it hangs on the dock's record: the link goes to the device, the one to the merged record goes
  mergeRecords(s, [{ name: 'Dell P2422H', serial: 'M1', ref: 'm1', links: [{ ref: 'dk7', kind: 'attached' }] }, { name: 'NB-7', serial: 'S7', ref: 'nb7', links: [] }], at);
  assert.deepEqual(s.rels.map(r => [r.from, r.to, r.kind]), [['mo', 'pc', 'attached']]);
  // the dock's own links (the switch port it is plugged into) are the device's, and a push of the device alone keeps them
  const sw = { id: 'sw', code: 'INV-0004', name: 'SW-1', status: 'active', type: 'switch', ports: 24, feed: { sys: 'Lansweeper', ref: 'sw1' } };
  s.objs.push(sw);
  mergeRecords(s, [{ name: 'nb-7.corp.example', ref: 'dk7', links: [{ ref: 'sw1', kind: 'connected', port: '5' }] }], at);
  assert.ok(s.rels.some(r => r.from === 'pc' && r.to === 'sw' && r.port === '5'), 'plugged in through the dock');
  mergeRecords(s, [{ name: 'NB-7', serial: 'S7', ref: 'nb7', links: [] }, { name: 'Dell P2422H', serial: 'M1', ref: 'm1', links: [{ ref: 'dk7', kind: 'attached' }] }], at);
  assert.ok(s.rels.some(r => r.from === 'mo' && r.to === 'pc'), 'the monitor stays on the device');
  // a dock kept as an attachment (Merge docking-station records): by its ref and the name Lansweeper sees it as
  const t = { objs: [{ ...pc, accessories: [{ name: 'Docking station', kind: 'Dock', seenAs: 'nb-7.corp.example', ref: 'dk7' }] }, { ...mon }], rels: [], users: [], locs: [], history: {}, feedOn: true, policy: {} };
  mergeRecords(t, [{ name: 'Dell P2422H', serial: 'M1', ref: 'm1', links: [{ ref: 'dk7', kind: 'attached' }] }], at);
  assert.deepEqual(t.rels.map(r => [r.from, r.to]), [['mo', 'pc']]);
});
