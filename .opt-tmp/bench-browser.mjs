import { chromium } from 'playwright';
const R = process.env.R || './orig/server';
const { seedDb, tmpFile } = await import(R.includes('orig') ? './seedo.mjs' : './seedp.mjs');
const { createApp } = await import(R + '/app.js');
const { db } = seedDb(tmpFile(), { sw: +(process.env.SW ?? 40) });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] }));
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.goto(base + '/'); await page.waitForSelector('#lgUser');
await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123');
const t0 = Date.now(); await page.click('#lgOk'); await page.waitForSelector('.card', { timeout: 120000 });
console.log('sign-in -> first cards painted'.padEnd(40), Date.now() - t0, 'ms');
const res = await page.evaluate(async (only) => {
  const core = await import('/js/01-core.js'), rp = await import('/js/07-render-plans.js'), set = await import('/js/04-settings.js');
  const out = {};
  const settle = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const time = async (label, fn, n = 3) => { let best = 1e9, js = 0; for (let i = 0; i < n; i++) { await settle(); const a = performance.now(); fn(); const b = performance.now(); document.body.getBoundingClientRect(); const c = performance.now(); if (c - a < best) { best = c - a; js = b - a; } } out[label] = `${best.toFixed(0)} ms (js ${js.toFixed(0)})`; };
  for (const tab of ['overview', 'cards', 'table', 'contacts', 'map', 'sw']) { if (only && !only.includes(tab)) continue; core.st.tab = tab; await time('render ' + tab, () => rp.render(), tab === 'map' ? 1 : 3); }
  core.st.tab = 'cards'; rp.render();
  const search = document.querySelector('#search');
  for (const tab of ['cards', 'table']) {
    core.st.tab = tab; core.st.q = ''; search.value = ''; rp.render();
    for (const q of ['p', 'pe', 'per', 'person 12']) await time(`search "${q}" on ${tab}`, () => { search.value = q; search.dispatchEvent(new Event('input')); }, 2);
    search.value = ''; search.dispatchEvent(new Event('input'));
  }
  core.st.q = 'zzz'; await time('filtered() q=zzz (no hit)', () => core.filtered(), 3); core.st.q = '';
  await time('objs.map(o => o.user) (bindUser getters)', () => core.objs.map(o => o.user), 3);
  await time('renderSide()', () => (window.__v ||= null, null), 1);
  const views = await import('/js/02-views.js');
  await time('renderSide()', () => views.renderSide(), 3);
  await time('documents()', () => rp.documents(), 3);
  await time('setBaseline()', () => rp.setBaseline(), 2);
  await time('pendingChanges()', () => rp.pendingChanges(), 3);
  const r = await fetch('api/state'); const txt = await r.text();
  let d; await time('JSON.parse /api/state', () => { d = JSON.parse(txt); }, 3);
  await time('applyState(d)', () => rp.applyState(JSON.parse(txt)), 2);
  // bulk select-all then render table
  core.st.tab = 'table'; rp.render(); core.st.bulk = new Set(core.objs.map(o => o.id));
  await time('renderTable with 5000 selected', () => views.renderTable(), 1);
  core.st.bulk = new Set();
  // open one object
  await time('open a PC object tab', () => views.openObj(core.objs.find(o => o.type === 'pc').id), 2);
  return out;
}, process.env.ONLY ? process.env.ONLY.split(',') : null);
for (const [k, v] of Object.entries(res)) console.log(k.padEnd(40), v);
await browser.close(); server.close();
