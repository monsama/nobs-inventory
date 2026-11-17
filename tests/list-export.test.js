import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';

/* A list the page shows (the IP addresses) as a PDF or Excel file: for anyone signed in, plain text within limits. */
test('a list from the page comes back as a PDF or an Excel workbook; bad lists are refused', async () => {
  const srv = await startServer();
  try {
    const body = { list: 'ips', name: 'ip-addresses', subtitle: 'All addresses', columns: [{ label: 'Address', w: 1 }, { label: 'Device', w: 2 }], rows: [['10.0.0.1', '=HYPERLINK("x")'], ['10.0.0.2', 'PC-2']] };
    assert.equal((await srv.call('POST', '/api/reports/list?format=pdf', { body })).status, 401, 'signed out');
    const a = await signIn(srv, 'admin', 'adminpass123');
    const pdf = await fetch(srv.base + '/api/reports/list?format=pdf', { method: 'POST', headers: { cookie: a.cookie, 'content-type': 'application/json', origin: srv.base }, body: JSON.stringify(body) });
    assert.equal(pdf.status, 200); assert.match(pdf.headers.get('content-type'), /pdf/);
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
    const x = await fetch(srv.base + '/api/reports/list?format=xlsx', { method: 'POST', headers: { cookie: a.cookie, 'content-type': 'application/json', origin: srv.base }, body: JSON.stringify(body) });
    assert.equal(x.status, 200); assert.match(x.headers.get('content-disposition'), /nobs-ip-addresses-\d{4}-\d\d-\d\d\.xlsx/);
    const zip = Buffer.from(await x.arrayBuffer());
    assert.equal(zip.subarray(0, 2).toString(), 'PK');
    assert.equal((await srv.call('POST', '/api/reports/list?format=pdf', { cookie: a.cookie, body: { ...body, columns: [] } })).status, 400);
    assert.equal((await srv.call('POST', '/api/reports/list?format=pdf', { cookie: a.cookie, body: { ...body, list: 'anything' } })).status, 404, 'a list of its own title');
    assert.equal((await srv.call('POST', '/api/reports/list?format=pdf', { cookie: a.cookie, body: { ...body, rows: Array(1001).fill(['a', 'b']) } })).status, 400, 'too many rows for a PDF');
    assert.equal((await srv.call('POST', '/api/reports/list?format=pdf', { cookie: a.cookie, body: { ...body, columns: Array(13).fill({ label: 'x' }) } })).status, 400);
  } finally { await srv.close(); }
});

/* The device list of the Table: Excel only, as many columns as the Table shows, longer cells; a viewer may make it. */
test('the device list comes back as an Excel workbook with all its columns; no PDF', async () => {
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const columns = Array.from({ length: 30 }, (_, i) => ({ label: 'Column ' + (i + 1), w: 1 }));
    const long = 'x'.repeat(400);
    const body = { list: 'devices', name: 'inventory-pc', subtitle: '2 of 30 devices', columns, rows: [columns.map((_, i) => i === 0 ? 'PC-1' : i === 1 ? '=1+1' : i === 29 ? long : 'v' + i), columns.map(() => 'PC-2')] };
    const post = (fmt, b = body) => fetch(srv.base + '/api/reports/list?format=' + fmt, { method: 'POST', headers: { cookie: a.cookie, 'content-type': 'application/json', origin: srv.base }, body: JSON.stringify(b) });
    const x = await post('xlsx');
    assert.equal(x.status, 200); assert.match(x.headers.get('content-disposition'), /nobs-inventory-pc-\d{4}-\d\d-\d\d\.xlsx/);
    const file = Buffer.from(await x.arrayBuffer()).toString('latin1');
    assert.ok(file.includes('Column 30') && file.includes('AD1'), 'all 30 columns, past Z');
    assert.ok(file.includes(long), 'a long cell is kept whole');
    assert.ok(!/<f>1\+1<\/f>/.test(file) && file.includes('=1+1'), 'a cell starting with = stays text');
    assert.equal((await post('pdf')).status, 400, 'no PDF of the device list');
    assert.equal((await post('xlsx', { ...body, columns: Array(81).fill({ label: 'x' }) })).status, 400, 'up to 80 columns');
    assert.equal((await post('xlsx', { ...body, list: '__proto__' })).status, 404, 'only known lists');
  } finally { await srv.close(); }
});

test('a device list over 400 000 cells is refused with what to do', async () => {
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const columns = Array.from({ length: 41 }, (_, i) => ({ label: 'C' + i }));
    const r = await fetch(srv.base + '/api/reports/list?format=xlsx', { method: 'POST', headers: { cookie: a.cookie, 'content-type': 'application/json', origin: srv.base }, body: JSON.stringify({ list: 'devices', name: 'big', columns, rows: Array(10000).fill(['x']) }) });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /fewer columns/);
  } finally { await srv.close(); }
});
