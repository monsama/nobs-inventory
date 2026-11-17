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

test('a printer on a WSD port, a share named a little differently, a port with an old address, and the list of all printers', async () => {
  const { printerMatch, printerRows } = await import('../public/js/printers.js');
  const pr = (id, name, more = {}) => ({ id, type: 'printer', name, status: 'active', ...more });
  const color = pr('p1', 'Floor 2 Colour', { ip: '10.0.0.7', model: 'Example ColorJet 400' }), mono = pr('p2', 'PRN-MONO-1', { ip: '10.0.0.20' });
  const srv = { id: 's1', type: 'server', name: 'PRINTSRV01', status: 'active' };
  const pc = { id: 'pc1', type: 'pc', name: 'PC-1', status: 'active', lsPrinters: [
    { name: 'Floor 2 Colour (WSD)', port: 'WSD-1234', kind: 'net' },
    { name: '\\\\printsrv01\\floor2-colour', port: '', kind: 'share', host: 'printsrv01', share: 'floor2-colour' },
    { name: 'PRN-MONO-1', port: 'IP_10.0.0.5', kind: 'ip', ip: '10.0.0.5' },
    { name: 'Lobby', port: 'WSD-9', kind: 'net', driver: 'Example ColorJet 400' },
    { name: 'Unknown one', port: '10.0.0.99', kind: 'ip', ip: '10.0.0.99' }] };
  const objs = [color, mono, srv, pc], [wsd, share, old, byModel, none] = pc.lsPrinters;
  assert.equal(printerMatch(wsd, pc, objs, []).d, color, 'a WSD port is found by the printer\'s name');
  const m = printerMatch(share, pc, objs, []);
  assert.equal(m.d, color, 'a share is found by its name written another way'); assert.equal(m.via, srv, 'the print server');
  const s = printerMatch(old, pc, objs, []);
  assert.equal(s.d, mono); assert.deepEqual(s.stale, { port: '10.0.0.5', now: '10.0.0.20' }, 'a port with an old address');
  assert.equal(printerMatch(byModel, pc, objs, []).by, 'model');
  assert.equal(printerMatch(none, pc, objs, []).d, null);
  const twin = pr('p3', 'Floor 2 Colour');
  assert.equal(printerMatch(wsd, pc, [...objs, twin], []).d, null, 'two printers with the name: none is guessed');
  const rows = printerRows([...objs, pr('p4', 'Unused')], []);
  const of = id => rows.find(r => r.d && r.d.id === id);
  assert.equal(of('p1').users.length, 1, 'one row for the colour printer: the computer that reaches it three ways counts once');
  assert.deepEqual([...of('p1').kinds].sort(), ['net', 'share'], 'with each way it is reached');
  assert.equal(of('p2').stale.length, 1);
  assert.equal(of('p4').users.length, 0, 'a printer no computer uses is listed');
  assert.equal(rows.filter(r => !r.d).length, 1, 'the printer not in the inventory once');
});
