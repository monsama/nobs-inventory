import { chromium } from 'playwright';
const { seedDb, tmpFile } = await import('./seedo.mjs');
const { createApp } = await import('./orig/server/app.js');
const { db } = seedDb(tmpFile(), { sw: 40 });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] }));
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch {} });
const page = await ctx.newPage();
await page.goto(base + '/'); await page.waitForSelector('#lgUser');
await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk'); await page.waitForSelector('.card', { timeout: 120000 });
await page.waitForTimeout(1000);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
const scenarios = (process.env.SC || 'cards,table,searchCards,searchTable,map,frame').split(',');
for (const sc of scenarios) {
  await cdp.send('Profiler.start');
  const ms = await page.evaluate(async sc => {
    const core = await import('/js/01-core.js'), rp = await import('/js/07-render-plans.js');
    const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    const s = document.querySelector('#search');
    const go = async fn => { await frame(); const a = performance.now(); fn(); await frame(); return Math.round(performance.now() - a); };
    if (sc === 'cards') { core.st.tab = 'cards'; return go(() => rp.render()); }
    if (sc === 'table') { core.st.tab = 'table'; return go(() => rp.render()); }
    if (sc === 'map') { core.st.tab = 'map'; return go(() => rp.render()); }
    if (sc === 'searchCards') { core.st.tab = 'cards'; rp.render(); await frame(); const r = []; for (const q of ['p', 'pe', 'per']) r.push(await go(() => { s.value = q; s.dispatchEvent(new Event('input')); })); s.value = ''; s.dispatchEvent(new Event('input')); return r.join('/'); }
    if (sc === 'searchTable') { core.st.tab = 'table'; rp.render(); await frame(); const r = []; for (const q of ['p', 'pe', 'per']) r.push(await go(() => { s.value = q; s.dispatchEvent(new Event('input')); })); s.value = ''; s.dispatchEvent(new Event('input')); return r.join('/'); }
  }, sc);
  const { profile: p } = await cdp.send('Profiler.stop');
  const byId = new Map(p.nodes.map(n => [n.id, n])), self = new Map();
  for (let i = 0; i < p.samples.length; i++) { const n = byId.get(p.samples[i]); const cf = n.callFrame; const k = (cf.functionName || '(anon)') + ' ' + cf.url.split('/').pop() + ':' + (cf.lineNumber + 1); self.set(k, (self.get(k) || 0) + p.timeDeltas[i] / 1000); }
  console.log(`== ${sc}: ${ms} ms to next frame`);
  console.log([...self].filter(([k]) => !/^\(idle\)|^\(program\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => '  ' + v.toFixed(0).padStart(5) + 'ms ' + k).join('\n'));
}
await browser.close(); server.close();
