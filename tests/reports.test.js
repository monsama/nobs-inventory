/* Reports: what each holds, and the PDF and Excel files made of them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { buildReport, reportOptions } from '../public/js/reports.js';
import { reportPdf, reportXlsx } from '../server/report-files.js';

const TODAY = new Date('2026-10-30T09:00:00Z');
const state = () => ({
  currency: 'CHF', company: { name: 'Example AG' },
  types: { pc: { label: 'PC' }, notebook: { label: 'Notebook' } },
  users: [{ id: 'u1', name: 'Anna Muster', dept: 'IT' }],
  objs: [
    { id: 'a', code: 'INV-0001', name: 'NB-1', type: 'notebook', status: 'active', uid: 'u1', loc: 'Bern / EG', purchased: '2020-03-01', price: 1500, warranty: '2023-03-01' },
    { id: 'b', code: 'INV-0002', name: 'PC-2', type: 'pc', status: 'stock', loc: 'Zürich / 1. OG', purchased: '2026-02-10', price: 900.5, supplier: 'Shop AG' },
    { id: 'c', code: 'INV-0003', name: 'PC-OLD', type: 'pc', status: 'retired', purchased: '2015-01-01' },
    { id: 'd', code: 'INV-0004', name: 'Waiting', type: 'pc', status: 'active', review: { src: 'ad', at: 'x' } },
  ],
  contracts: [{ id: 'k1', name: 'Support <Firewall> & more', kind: 'support', supplier: 'Net AG', cost: 1200, per: 'year', start: '2026-07-01', end: '2027-06-30' }],
  licences: [{ id: 'l1', name: 'Office', seats: 10, cost: 100, per: 'month', start: '2025-01-01' }],
});

test('the reports: inventory by group, replacement by purchase date, costs of a year', () => {
  assert.deepEqual(reportOptions({ kind: 'nope', group: 'x', years: '99', year: '1900' }, TODAY), { kind: 'inventory', group: 'site', years: 15, year: 2026, id: '' });
  const inv = buildReport(state(), { kind: 'inventory', group: 'dept' }, TODAY);
  assert.equal(inv.count, 2, 'retired and waiting devices are not in the inventory');
  assert.deepEqual(inv.groups.map(g => [g.name, g.rows.map(r => r[1])]), [['IT', ['NB-1']], ['No department', ['PC-2']]]);
  assert.deepEqual(inv.groups[0].rows[0].slice(5, 10), ['Anna Muster', 'IT', 'Bern / EG', 'In use', '01.03.2023']);
  const life = buildReport(state(), { kind: 'lifecycle', years: 5 }, TODAY);
  assert.deepEqual(life.groups.map(g => [g.name, g.rows.map(r => r[1])]), [['Overdue', ['NB-1']], ['Later', ['PC-2']]]);
  assert.equal(life.groups[0].rows[0][7], 6.6, 'its age in years');
  assert.equal(life.groups[0].rows[0][9], '01.03.2025');
  const costs = buildReport(state(), { kind: 'costs', year: 2026 }, TODAY);
  assert.deepEqual(costs.groups.map(g => [g.name, g.total]), [['Contracts', 600], ['Licences', 1200], ['Devices bought', 900.5]]);
  assert.equal(costs.total, 2700.5);
});

test('a report as a PDF and as an Excel workbook', async () => {
  const r = buildReport(state(), { kind: 'costs', year: 2026 }, TODAY);
  const pdf = await reportPdf(r, { name: 'Example AG' });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const x = reportXlsx(r);
  assert.equal(x.readUInt32LE(0), 0x04034b50, 'a zip');
  /* The files in it, from the zip's own directory, each checked against its CRC. */
  const end = x.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = x.readUInt32LE(end + 16); const files = {};
  for (let i = 0; i < x.readUInt16LE(end + 10); i++) {
    const nl = x.readUInt16LE(at + 28), off = x.readUInt32LE(at + 42), size = x.readUInt32LE(at + 24), crc = x.readUInt32LE(at + 16);
    const name = x.subarray(at + 46, at + 46 + nl).toString();
    const data = x.subarray(off + 30 + x.readUInt16LE(off + 26), off + 30 + x.readUInt16LE(off + 26) + size);
    assert.equal(zlib.crc32(data) >>> 0, crc, name);
    files[name] = data.toString(); at += 46 + nl;
  }
  assert.deepEqual(Object.keys(files).sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
  const sheet = files['xl/worksheets/sheet1.xml'];
  assert.match(sheet, /Support &lt;Firewall&gt; &amp; more/, 'text is escaped');
  assert.match(sheet, /<c r="H2" s="2"><v>600<\/v><\/c>/, 'amounts stay numbers');
  assert.match(sheet, /<f>SUM\(H2:H4\)<\/f><v>2700.5<\/v>/, 'with their total');
  assert.match(sheet, /<pane ySplit="1"/); assert.match(sheet, /<autoFilter ref="A1:H4"\/>/);
});

test('a stocktake as a report: missing, moved, not in the inventory, confirmed', async () => {
  const { stocktakeResult, stocktakesProblem, verifiedProblem } = await import('../public/js/stocktake.js');
  const s = state();
  s.objs.push({ id: 'e', code: 'INV-0005', name: 'PC-E', type: 'pc', status: 'active', loc: 'Bern / EG' });
  s.objs[0].verified = { at: '2026-10-30', by: 'Anna', st: 't1' };
  s.objs[1].verified = { at: '2026-10-30', by: 'Anna', st: 't1', from: 'Bern / EG' };
  const t = { id: 't1', name: 'Autumn', scope: '', started: '2026-10-30T07:00:00Z', by: 'Anna', unknown: [{ text: 'XYZ', at: 'x' }] };
  t.result = stocktakeResult(t, s.objs); t.finished = '2026-10-30T09:00:00Z'; t.finishedBy = 'Anna';
  assert.deepEqual([t.result.total, t.result.confirmed, t.result.missing.length, t.result.moved.map(m => m.from), t.result.unknown], [3, 2, 1, ['Bern / EG'], ['XYZ']]);
  s.stocktakes = [t];
  const r = buildReport(s, { kind: 'stocktake', id: 't1' }, TODAY);
  assert.equal(r.title, 'Autumn');
  assert.deepEqual(r.groups.map(g => [g.name, g.rows.length]), [['Missing', 1], ['Moved here', 1], ['Not in the inventory', 1], ['Confirmed', 2]]);
  assert.equal(buildReport(s, { kind: 'stocktake', id: 'nope' }, TODAY).groups.length, 0);
  assert.equal(stocktakesProblem([t]), '');
  assert.ok(stocktakesProblem([{ id: '', name: 'x' }]));
  assert.equal(verifiedProblem(s.objs[1].verified), '');
  assert.ok(verifiedProblem({ at: '30.10.2026' }));
});

test('a hand-back list: the devices one person has, with what goes with them, to tick off', async () => {
  const s = state();
  s.objs.push({ id: 'z', code: 'INV-0009', name: 'PH-9', type: 'notebook', status: 'retired', uid: 'u1' });
  s.objs[0].accessories = [{ name: 'Docking station' }];
  const r = buildReport(s, reportOptions({ kind: 'handback', id: 'u1' }, TODAY), TODAY);
  assert.equal(r.title, 'Hand-back list: Anna Muster');
  assert.deepEqual(r.groups[0].rows.map(x => x[1]), ['NB-1'], 'only what is not retired');
  assert.equal(r.groups[0].rows[0][5], 'Docking station');
  assert.match(r.subtitle, /Handed back on .* Signature/);
  assert.equal(reportOptions({ kind: 'handback', id: 'ldap-a.muster@x' }).id, 'ldap-a.muster@x');
  assert.ok((await reportPdf(r, {})).length > 1000);
});
