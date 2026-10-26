const R = process.env.R || '../server';
const { seedDb, tmpFile } = await import(R === '../server' ? './seed.mjs' : R.includes('orig') ? './seedo.mjs' : './seedp.mjs');
const { createApp } = await import(R + '/app.js');
const { createFeedToken } = await import(R + '/feed-token.js').catch(() => ({}));
const { db, data } = seedDb(tmpFile(), { sw: +(process.env.SW || 0) });
const server = await new Promise(r => { const x = createApp({ db, feedToken: 'tok-123456789012345678901234567890' }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const lg = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: 'adminpass123' }) });
const cookie = lg.headers.get('set-cookie').split(';')[0];
const T = async (label, fn, n = 3) => { let best = Infinity, out; for (let i = 0; i < n; i++) { const a = performance.now(); out = await fn(); best = Math.min(best, performance.now() - a); } console.log(label.padEnd(46), best.toFixed(0), 'ms', out ?? ''); return out; };
let st;
await T('GET /api/state', async () => { const r = await fetch(base + '/api/state', { headers: { Cookie: cookie } }); const txt = await r.text(); const a = performance.now(); st = JSON.parse(txt); return `(${(txt.length / 1e6).toFixed(2)} MB, parse ${(performance.now() - a).toFixed(0)} ms, gzip? ${r.headers.get('content-encoding')})`; });
await T('POST /api/changes, 1 object', async () => { const o = st.objs[10]; o.purpose = 'x' + Math.random(); const r = await fetch(base + '/api/changes', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ puts: [{ kind: 'object', id: o.id, value: o, base: st.revs['object|' + o.id] }], dels: [] }) }); const j = await r.json(); st.revs['object|' + o.id] = j.revs['object|' + o.id]; return r.status; });
await T('POST /api/changes, delete 1 object', async () => { const o = st.objs.pop(); const r = await fetch(base + '/api/changes', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ puts: [], dels: [{ kind: 'object', id: o.id, base: st.revs['object|' + o.id] }, ...st.rels.filter(x => x.from === o.id || x.to === o.id).map(x => ({ kind: 'rel', id: x.id, base: st.revs['rel|' + x.id] })), { kind: 'history', id: o.id, base: st.revs['history|' + o.id] }] }) }); return r.status; }, 1);
// Lansweeper push requires lansweeper source 'push' setting? check lsRequire
const recs = data.objs.filter(o => o.feed).map(o => { const u = data.users.find(x => x.id === o.uid); return { name: o.name, serial: o.serial, ip: o.ip, mac: o.mac, os: o.os, model: o.model, assetType: o.type, ref: o.feed.ref, user: u ? u.login : '', userName: u ? u.name : '', userDept: u ? u.dept : '', scanned: '2026-10-25' }; });
await T('POST /api/feed/push 5000 (scanned date changes)', async () => { recs.forEach(r => r.ip = r.ip && r.ip.replace(/\.\d+$/, '.' + (Math.floor(Math.random() * 200) + 10))); const r = await fetch(base + '/api/feed/push', { method: 'POST', headers: { Authorization: 'Bearer tok-123456789012345678901234567890', 'Content-Type': 'application/json' }, body: JSON.stringify({ records: recs }) }); return r.status + ' ' + (await r.text()).slice(0, 120); }, 2);
server.close();
