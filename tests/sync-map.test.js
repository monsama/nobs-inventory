/* Settings → Data sources is drawn from public/js/sync-map.js, and the syncs read their field lists from it too: these
   checks keep the two from drifting apart. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AD_FILL, GRAPH_FILL, LS_FIELDS, SOURCE_EXTRAS, SOURCE_LABEL, SYNC_FIELD_LABEL } from '../public/js/sync-map.js';
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
