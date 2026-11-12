import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';

/* A list the page shows (the IP addresses) as a PDF or Excel file: for anyone signed in, plain text within limits. */
test('a list from the page comes back as a PDF or an Excel workbook; bad lists are refused', async () => {
  const srv = await startServer();
  try {
    const body = { title: 'IP addresses', name: 'ip-addresses', subtitle: 'All addresses', columns: [{ label: 'Address', w: 1 }, { label: 'Device', w: 2 }], rows: [['10.0.0.1', '=HYPERLINK("x")'], ['10.0.0.2', 'PC-2']] };
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
    assert.equal((await srv.call('POST', '/api/reports/list?format=pdf', { cookie: a.cookie, body: { ...body, columns: Array(13).fill({ label: 'x' }) } })).status, 400);
  } finally { await srv.close(); }
});
