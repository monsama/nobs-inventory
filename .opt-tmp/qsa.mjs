import { chromium } from 'playwright';
const { seedDb, tmpFile } = await import('./seedo.mjs');
const { createApp } = await import('./orig/server/app.js');
const { db } = seedDb(tmpFile(), { sw: 40 });
const server = await new Promise(r => { const x = createApp({ db }).listen(0, '127.0.0.1', () => r(x)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ni-started', '1'); } catch {} });
const page = await ctx.newPage();
await page.goto(base + '/'); await page.waitForSelector('#lgUser');
await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk'); await page.waitForSelector('.card', { timeout: 120000 });
await page.waitForTimeout(500);
console.log(await page.evaluate(async () => {
  const core = await import('/js/01-core.js'), rp = await import('/js/07-render-plans.js'), set = await import('/js/04-settings.js'), tips = await import('/js/tips.js'), views = await import('/js/02-views.js'), tb = await import('/js/06-topbar.js');
  const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const out = [];
  const t = (l, f, n = 3) => { let b = 1e9; for (let i = 0; i < n; i++) { const a = performance.now(); f(); b = Math.min(b, performance.now() - a); } out.push(l.padEnd(44) + b.toFixed(1) + ' ms'); };
  for (const tab of ['cards', 'table']) {
    core.st.tab = tab; rp.render(); await frame(); await frame();
    t(tab + ': fullTextTooltips()', () => core.fullTextTooltips());
    t(tab + ': applyRole()', () => set.applyRole());
    t(tab + ': addTips() (tips.js, per frame after any DOM change)', () => tips.addTips());
    t(tab + ': keyboardReach query', () => document.querySelectorAll('a.link:not([href]):not([tabindex])').forEach(() => {}));
    t(tab + ': updateSync()', () => core.updateSync());
    t(tab + ': renderSide()', () => views.renderSide());
    t(tab + ': filtered() no query', () => core.filtered());
    if (tab === 'table') { const tbl = document.querySelector('table.grid'); t('table: applyTable() (cell reorder)', () => tb.applyTable(tbl), 2); }
  }
  core.st.q = 'pe'; t('filtered() q=pe', () => core.filtered()); core.st.q = '';
  t('contactOf x10000 (find in 200)', () => { for (const o of core.objs) { core.contactOf(o.respIn); core.contactOf(o.respEx); } });
  t('relIndex()', () => core.relIndex());
  t('pendingChanges() (each render, +400ms)', () => rp.pendingChanges());
  return out.join('\n');
}));
await browser.close(); server.close();
