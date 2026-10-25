/* Browser test of Settings on a fresh server: every tab draws, and the admin can clear the inventory. */
import { chromium } from 'playwright';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { bootstrap } from '../../server/index.js';
import { loadState, saveState } from '../../server/state.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ni-settings-'));
const db = openDb(path.join(dir, 'inventory.db'));
bootstrap(db, { NI_ADMIN_PASSWORD: 'adminpass123' }, () => {});
const app = createApp({ db });
const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await context.addInitScript(() => localStorage.setItem('ni-started', '1'));
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(base + '/'); await page.waitForSelector('#lgUser');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPw', 'adminpass123'); await page.click('#lgOk');
  await page.waitForFunction(() => /Admin/.test(document.querySelector('#whoBtn').textContent));
  await page.click('#setBtn');
  for (const tab of ['feed', 'directory', 'locations', 'types', 'users', 'maintenance', 'log', 'about']) {
    await page.click(`#setTabs [data-st=${tab}]`); await page.waitForTimeout(120);
    const len = (await page.locator('#setPane').innerHTML()).length;
    assert.ok(len > 100, `Settings tab "${tab}" is empty`);
  }
  assert.equal(errors.length, 0, 'no page errors: ' + errors.join('; '));
  // LDAP and Microsoft Graph share a tab of their own; Feed and Users no longer show them
  await page.click('#setTabs [data-st=directory]'); await page.waitForSelector('#setGraph .panelbox'); await page.waitForSelector('#setLdap #lk_url');
  await page.click('#setTabs [data-st=feed]'); await page.waitForSelector('#setFeed');
  assert.equal(await page.locator('#setGraph').count(), 0, 'Feed does not show Microsoft Graph');
  await page.click('#setTabs [data-st=users]'); await page.waitForSelector('#setUsers');
  assert.equal(await page.locator('#setLdap').count(), 0, 'Users does not show LDAP');
  // Add subnet opens the editor, which spans the box; the device types ticked and the ranges added are saved
  await page.click('#setTabs [data-st=vlans]'); await page.waitForSelector('#snNew');
  await page.click('#snNew'); await page.waitForSelector('.sn-edit[data-sub="new"]');
  const formW = await page.locator('.sn-edit').evaluate(e => e.getBoundingClientRect().width);
  const boxW = await page.locator('#setSubnets').evaluate(e => e.getBoundingClientRect().width);
  assert.ok(formW > boxW * 0.9, `the subnet editor is ${Math.round(formW)}px wide in a ${Math.round(boxW)}px box`);
  await page.fill('.sn-edit [data-sn]', 'Office'); await page.fill('.sn-edit [data-sc]', '10.10.20.0/24'); await page.fill('.sn-edit [data-sg]', '10.10.20.1');
  await page.check('.sn-edit [data-sty][value=pc]'); await page.check('.sn-edit [data-sty][value=printer]');
  await page.click('.sn-edit [data-radd]');
  await page.fill('.sn-range [data-rf]', '10.10.20.50'); await page.fill('.sn-range [data-rt]', '10.10.20.99'); await page.selectOption('.sn-range [data-ru]', 'DHCP');
  await page.click('.sn-edit [data-ssave]'); await page.waitForSelector('[data-sedit="0"]');
  const saved = async () => page.evaluate(async () => (await import('/js/01-core.js')).SUBNETS[0]);
  assert.deepEqual((await saved()).types, ['pc', 'printer'], 'the ticked device types are kept');
  assert.deepEqual((await saved()).ranges, [{ from: '10.10.20.50', to: '10.10.20.99', use: 'DHCP' }]);
  assert.match(await page.textContent('#setSubnets .sn-item'), /Office.*10\.10\.20\.0\/24.*Gateway 10\.10\.20\.1.*DHCP 10\.10\.20\.50–99.*For PC, Printer/s);
  // a subnet in the list can be edited: Edit opens it, Save keeps the change, Cancel drops it
  await page.click('[data-sedit="0"]'); await page.waitForSelector('.sn-edit[data-sub="0"]');
  await page.fill('.sn-edit [data-sn]', 'Office Willisau'); await page.click('.sn-edit [data-tnone]');
  await page.click('.sn-edit [data-ssave]'); await page.waitForSelector('[data-sedit="0"]');
  assert.equal((await saved()).name, 'Office Willisau');
  assert.deepEqual((await saved()).types, []);
  await page.click('[data-sedit="0"]'); await page.fill('.sn-edit [data-sn]', 'Not this'); await page.click('.sn-edit [data-scancel]');
  assert.equal((await saved()).name, 'Office Willisau', 'Cancel keeps the subnet as it was');
  // Settings sections open and close by their title and stay as they were left, also when the section draws itself again
  await page.click('#setTabs [data-st=types]'); await page.waitForSelector('#setModels .hdr.sechdr');
  await page.click('#setModels .hdr');
  assert.equal(await page.locator('#setModels').evaluate(e => e.classList.contains('collapsed')), true);
  assert.equal(await page.isVisible('#setModels .lrows'), false, 'a closed section hides its content');
  await page.click('#setTabs [data-st=users]'); await page.click('#setTabs [data-st=types]'); await page.waitForSelector('#setModels .hdr.sechdr');
  assert.equal(await page.locator('#setModels').evaluate(e => e.classList.contains('collapsed')), true, 'still closed when the tab is opened again');
  await page.click('#setModels .hdr');
  assert.equal(await page.isVisible('#setModels .lrows'), true);
  // Per type: the type is chosen in the title, and the fields say how many objects of it have a value
  await page.selectOption('#tfType', 'pc');
  assert.match(await page.textContent('.tf-box'), /Fields on the PC page.*Own fields of PC.*On the PC card/s);
  assert.equal(await page.locator('.tf-box .sechdr').count(), 1);
  assert.equal(await page.locator('.tf-box').evaluate(e => e.classList.contains('collapsed')), false, 'choosing the type does not close the section');
  // push token: created in the app, shown once, a download is offered
  await page.click('#setTabs [data-st=feed]'); await page.waitForSelector('#pushNew:not([disabled])');
  await page.click('#pushNew'); await page.waitForSelector('#pushTok');
  assert.ok((await page.inputValue('#pushTok')).length >= 30, 'a token is shown after creating it');
  assert.equal(await page.isDisabled('#pushScript'), false, 'the script can be downloaded once a token exists');
  // clear the inventory: two clicks, devices gone, admin and settings kept
  saveState(db, { ...loadState(db), objs: [{ id: 'o1', code: 'INV-0001', type: 'pc', name: 'PC-X', ovr: {}, feed: null }], rels: [], history: {} });
  await page.click('#setTabs [data-st=feed]');
  await page.click('#setReset'); await page.waitForSelector('#clrOk');
  await page.fill('#clrWord', 'clear'); assert.equal(await page.isDisabled('#clrOk'), true, 'lower case confirms');
  await page.fill('#clrWord', 'CLEAR'); await page.click('#clrOk'); await page.waitForTimeout(400);
  assert.equal(loadState(db).objs.length, 0, 'devices are cleared on the server');
  assert.ok(loadState(db).users.some(u => u.role === 'admin'), 'the admin stays');
  console.log('browser settings: all checks passed');
} finally {
  await browser.close(); await new Promise(r => server.close(r)); db.close();
}
