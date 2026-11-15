import { test } from 'node:test';
import assert from 'node:assert/strict';
import { printerKind, realPrinters, printerDevice } from '../public/js/printers.js';
import { mergeRecords, recordsFromJson } from '../server/feed.js';

/* The printers Lansweeper finds on a Windows machine: only the real ones are kept, each by how it is connected. */
test('real printers by their port: USB, network by address, shared, network by name; virtual ones left out', () => {
  assert.deepEqual(printerKind('HP LaserJet M404', 'USB001'), { kind: 'usb' });
  assert.deepEqual(printerKind('Label printer', 'DOT4_001'), { kind: 'usb' });
  assert.deepEqual(printerKind('Floor 2', 'IP_10.1.0.25'), { kind: 'ip', ip: '10.1.0.25' });
  assert.deepEqual(printerKind('Floor 2', '10.1.0.26_1'), { kind: 'ip', ip: '10.1.0.26' });
  assert.deepEqual(printerKind('\\\\PRINTSRV01\\Floor-2', 'Floor-2'), { kind: 'share', host: 'printsrv01', share: 'Floor-2' });
  assert.deepEqual(printerKind('Plotter', 'WSD-1234-abcd'), { kind: 'net' });
  assert.deepEqual(printerKind('Plotter', 'plotter-2og.corp.example'), { kind: 'net', host: 'plotter-2og.corp.example' });
  for (const [n, p] of [['Microsoft Print to PDF', 'PORTPROMPT:'], ['Microsoft XPS Document Writer', 'XPSPort:'], ['OneNote (Desktop)', 'nul:'], ['Fax', 'SHRFAX:'], ['HP (redirected 2)', 'TS001'], ['Adobe PDF', 'Documents\\*.pdf'], ['Something', '']]) {
    assert.equal(printerKind(n, p), null, `${n} on ${p} is no real printer`);
  }
  const list = realPrinters([{ name: 'Microsoft Print to PDF', port: 'PORTPROMPT:' }, { name: 'HP', port: 'USB001', driver: 'HP Universal' }, { name: 'HP', port: 'USB001' }, null, { name: 'Floor', port: 'IP_10.0.0.9' }]);
  assert.deepEqual(list.map(p => [p.name, p.kind]), [['HP', 'usb'], ['Floor', 'ip']], 'virtual and repeated ones are dropped');
});

test('a printer on a computer is matched to the printer device: by address, share, name, or attached by USB', () => {
  const pc = { id: 'pc', type: 'pc', name: 'PC-1', status: 'active' };
  const net = { id: 'n', type: 'printer', name: 'PRN-2OG', ip: '10.0.0.9', status: 'active' };
  const shared = { id: 's', type: 'printer', name: 'Floor-2', status: 'active' };
  const usb = { id: 'u', type: 'printer', name: 'HP', status: 'active' };
  const old = { id: 'o', type: 'printer', name: 'OLD', ip: '10.0.0.8', status: 'retired' };
  const objs = [pc, net, shared, usb, old], rels = [{ from: 'u', to: 'pc', kind: 'attached' }];
  assert.equal(printerDevice({ kind: 'ip', ip: '10.0.0.9' }, pc, objs, rels), net);
  assert.equal(printerDevice({ kind: 'ip', ip: '10.0.0.8' }, pc, objs, rels), null, 'a retired printer is not matched');
  assert.equal(printerDevice({ kind: 'share', host: 'printsrv01', share: 'Floor-2', name: '\\\\PRINTSRV01\\Floor-2' }, pc, objs, rels), shared);
  assert.equal(printerDevice({ kind: 'net', host: 'prn-2og.corp.example' }, pc, objs, rels), net);
  assert.equal(printerDevice({ kind: 'usb', name: 'HP' }, pc, objs, rels), usb);
  assert.equal(printerDevice({ kind: 'usb', name: 'HP' }, { ...pc, id: 'pc2' }, objs, rels), null, 'a USB printer is matched only on its own computer');
});

test('a push brings the real printers onto the device; a push without them keeps the list', () => {
  const s = { objs: [{ id: 'a', code: 'INV-1', type: 'pc', name: 'PC-1', serial: 'S1', status: 'active', feed: { sys: 'Lansweeper', ref: '1' } }], rels: [], users: [], policy: {}, feedOn: true, intake: 'direct', locs: [], seq: 10, codeN: 1, rseq: 0, types: {}, history: {} };
  const c = mergeRecords(s, recordsFromJson([{ name: 'PC-1', serial: 'S1', ref: '1', printers: [{ name: 'Microsoft Print to PDF', port: 'PORTPROMPT:' }, { name: 'HP', port: 'USB001' }] }]), new Date(), []);
  assert.deepEqual(s.objs[0].lsPrinters.map(p => p.name), ['HP']);
  assert.equal(c.printers, 1);
  const again = mergeRecords(s, recordsFromJson([{ name: 'PC-1', serial: 'S1', ref: '1' }]), new Date(), []);
  assert.equal(again.printers, 0); assert.deepEqual(s.objs[0].lsPrinters.map(p => p.name), ['HP'], 'kept when not sent');
  mergeRecords(s, recordsFromJson([{ name: 'PC-1', serial: 'S1', ref: '1', printers: [] }]), new Date(), []);
  assert.equal(s.objs[0].lsPrinters, undefined, 'an empty list sent clears it');
});
