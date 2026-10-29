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
