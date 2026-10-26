import { chromium } from 'playwright';
const R = process.env.R || './orig/server';
const { seedDb, tmpFile } = await import(R.includes('orig') ? './seedo.mjs' : './seedp.mjs');
const { createApp } = await import(R + '/app.js');
const { db } = seedDb(tmpFile(), { sw: 40 });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] }));
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch {} });
const page = await ctx.newPage();
await page.goto(base + '/'); await page.waitForSelector('#lgUser');
await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123');
let a = Date.now(); await page.click('#lgOk'); await page.waitForSelector('.card', { timeout: 120000 }); console.log('sign-in to cards', Date.now() - a, 'ms');
await page.waitForTimeout(800);
for (const sc of (process.env.SC || 'table,searchTable,cards,searchCards,map,overview,contacts,sw').split(',')) {
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
  const ms = await page.evaluate(async sc => {
    const core = await import('/js/01-core.js'), rp = await import('/js/07-render-plans.js');
    const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    const s = document.querySelector('#search');
    const go = async fn => { await frame(); const a = performance.now(); fn(); await frame(); return Math.round(performance.now() - a); };
    const tab = sc.replace('search', '').toLowerCase();
    if (!sc.startsWith('search')) { core.st.tab = 'cards'; rp.render(); await frame(); core.st.tab = tab; return go(() => rp.render()); }
    core.st.tab = tab; rp.render(); await frame(); const r = await go(() => { s.value = 'pe'; s.dispatchEvent(new Event('input')); }); s.value = ''; s.dispatchEvent(new Event('input')); await frame(); return r;
  }, sc);
  const buf = await browser.stopTracing();
  const ev = JSON.parse(buf.toString()).traceEvents;
  const sum = {}; for (const e of ev) if (e.ph === 'X' && ['Layout', 'UpdateLayoutTree', 'Paint', 'ParseHTML', 'FunctionCall', 'EvaluateScript', 'RunMicrotasks', 'FireAnimationFrame', 'TimerFire', 'PrePaint', 'Layerize'].includes(e.name)) sum[e.name] = (sum[e.name] || 0) + e.dur / 1000;
  console.log(sc.padEnd(12), String(ms).padStart(5), 'ms to next frame |', Object.entries(sum).map(([k, v]) => k + ' ' + v.toFixed(0)).join(', '));
}
await browser.close(); server.close();
