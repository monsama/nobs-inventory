import { chromium } from 'playwright';
const R = process.env.R || './orig/server';
const { seedDb, tmpFile } = await import(R.includes('orig') ? './seedo.mjs' : './seedp.mjs');
const { createApp } = await import(R + '/app.js');
const { db } = seedDb(tmpFile(), { sw: 40 });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch {} });
const page = await ctx.newPage();
await page.goto(base + '/'); await page.waitForSelector('#lgUser');
await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123');
const a = Date.now(); await page.click('#lgOk'); await page.waitForSelector('.card', { timeout: 120000 }); const login = Date.now() - a;
await page.waitForTimeout(800);
const r = await page.evaluate(async () => {
  const core = await import('/js/01-core.js'), rp = await import('/js/07-render-plans.js');
  const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const s = document.querySelector('#search');
  const med = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const go = async (fn, n = 3, pre) => { const r = []; for (let i = 0; i < n; i++) { if (pre) pre(); await new Promise(r => setTimeout(r, 450)); await frame(); const a = performance.now(); fn(); await frame(); r.push(performance.now() - a); } return Math.round(med(r)); };
  const out = {};
  for (const tab of ['overview', 'cards', 'table', 'contacts', 'map', 'sw']) out['tab ' + tab] = await go(() => { core.st.tab = tab; rp.render(); }, 3, () => { core.st.tab = 'overview'; rp.render(); });
  for (const tab of ['cards', 'table']) { core.st.tab = tab; rp.render(); await frame(); out['type "pe" on ' + tab] = await go(() => { s.value = s.value === 'pe' ? 'p' : 'pe'; s.dispatchEvent(new Event('input')); }); s.value = ''; s.dispatchEvent(new Event('input')); await frame(); }
  return out;
});
console.log(JSON.stringify({ R, login, ...r }));
await browser.close(); server.close();
