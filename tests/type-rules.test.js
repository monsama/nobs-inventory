import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signIn } from './helpers.js';
import { loadState, saveState, checkState } from '../server/state.js';
import { typeFor } from '../server/feed.js';
import { DEFAULT_TYPE_RULES, ruleMatches, typeByRules } from '../public/js/type-rules.js';

/* The type rules: the shipped ones, an edited list, and Apply to existing devices (preview, then only the ticked ones;
   a type set by hand is never changed). */
test('the shipped rules tell notebooks, cameras, controllers and switches from what Lansweeper calls them', () => {
  const t = (type, model, name = '', chassis = '', role = '') => typeFor({}, type, model, role, name, chassis);
  assert.equal(t('Windows', 'HP EliteDesk 800 G9', '', 'desktop', 'workstation'), 'pc');
  assert.equal(t('Windows', 'HP EliteBook 840 G10', '', '', 'workstation'), 'notebook', 'by the model');
  assert.equal(t('Windows', 'Some OEM board', '', 'notebook', 'workstation'), 'notebook', 'by the chassis');
  assert.equal(t('Windows', 'Dell Latitude 5440', '', 'laptop', 'server'), 'server', 'Windows says server: a server');
  assert.equal(t('Network device', 'Hikvision DS Series', 'DS-2CD2643G1-IZS20210301AAWR'), 'camera');
  assert.equal(t('Network device', 'Hikvision DS-7716NI-K4', 'Hikvision 172.21.103.16'), 'camera');
  assert.equal(t('WebServer', 'Saia-Burgess Controls Saia', 'Saia PCD Web-Server'), 'plc');
  assert.equal(t('Network device', 'HMS Industrial Networks', 'HMS Industrial Networks 172.21.103.102'), 'plc');
  assert.equal(t('Network device', '', 'NETGEAR GS108Ev3'), 'switch');
  assert.equal(t('VoIP', 'ALE International OXO050/042.001 GW_050/042', 'ALE International 172.21.103.5'), 'pbx', 'an OmniPCX Office is a phone system');
  assert.equal(t('VoIP', 'PATTON ELECTRONICS CO.', 'PATTON ELECTRONICS CO. 172.21.103.6'), 'pbx', 'a Patton VoIP gateway belongs to the phone system');
  assert.equal(t('Network device', 'Hewlett-Packard 8360-24XF2C v2 (JL722C)', 'core-sw'), 'switch', 'an Aruba CX 8360 is a switch');
  assert.equal(t('WebServer', '', '403 Forbidden'), 'other');
  assert.equal(t('Windows', '', 'acmepc11'), 'pc');
  // a short word matches a whole word only
  assert.equal(ruleMatches({ field: 'type', words: 'pc' }, { type: 'Windows PC' }), true);
  assert.equal(ruleMatches({ field: 'type', words: 'pc' }, { type: 'Saia PCD' }), false);
});

test('an edited list decides instead of the shipped one; a rule switched off is skipped; a wrong list is refused', () => {
  const rules = [{ field: 'name', words: 'acmenb', to: 'notebook', on: true }, { field: 'name', words: 'acme', to: 'server', on: false }, ...DEFAULT_TYPE_RULES];
  assert.equal(typeFor({ typeRules: rules }, 'Windows', 'INVENTEC Corporation', 'workstation', 'acmenb35.corp.local'), 'notebook');
  assert.equal(typeFor({ typeRules: rules }, 'Windows', '', 'workstation', 'acmepc11'), 'pc', 'the rule that is off is skipped');
  assert.equal(typeByRules([], { type: 'Windows' }).type, 'other', 'no rules at all: other');
  const base = { objs: [], rels: [], users: [], locs: [], types: {}, history: {} };
  checkState({ ...base, typeRules: rules });
  checkState({ ...base, typeRules: null });
  assert.throws(() => checkState({ ...base, typeRules: [{ field: 'colour', words: 'x', to: 'pc' }] }), /looks at colour/);
  assert.throws(() => checkState({ ...base, typeRules: [{ field: 'model', words: ' , ', to: 'pc' }] }), /needs words/);
  assert.throws(() => checkState({ ...base, typeRules: [{ field: 'model', words: 'x', to: 'spaceship' }] }), /does not exist/);
});

test('Apply to existing devices: a preview first, then only the ticked ones change; a type set by hand stays', async () => {
  const srv = await startServer();
  try {
    const a = await signIn(srv, 'admin', 'adminpass123');
    const dev = (id, name, type, model, assetType, extra = {}) => ({ id, code: 'INV-' + id, name, type, model, status: 'active', loc: '', ovr: {}, feed: { sys: 'Lansweeper', ref: id, assetType }, ...extra });
    const s = loadState(srv.db);
    saveState(srv.db, { ...s, objs: [
      dev('1', 'NB-1', 'pc', 'Lenovo ThinkPad T14', 'Windows'),
      dev('2', 'CAM-1', 'other', 'Hikvision DS-2CD2643G1-IZS', 'Network device'),
      dev('3', 'NB-2', 'pc', 'HP EliteBook 840', 'Windows', { ovr: { type: false } }),
      dev('4', 'NB-3', 'pc', 'Dell Latitude 5440', 'Windows'),
      dev('5', 'PC-HAND', 'pc', 'Dell Latitude 7440', 'Windows'),
      { id: '6', code: 'INV-6', name: 'NB-OWN', type: 'pc', model: 'Dell Latitude 5440', status: 'active', loc: '', ovr: {}, feed: null },
    ], history: { 5: [{ t: '2026-10-01 10:00', msg: 'Type changed from Notebook to PC by Anna' }] } });
    const preview = (await srv.call('POST', '/api/feed/retype', { cookie: a.cookie, body: {} })).json.changes;
    assert.deepEqual(preview.map(x => [x.name, x.from, x.to]), [['NB-1', 'pc', 'notebook'], ['CAM-1', 'other', 'camera'], ['NB-3', 'pc', 'notebook']],
      'set by hand (marked, or in the history) and not from Lansweeper are left out');
    assert.equal(loadState(srv.db).objs.find(o => o.id === '1').type, 'pc', 'the preview changes nothing');
    const done = (await srv.call('POST', '/api/feed/retype', { cookie: a.cookie, body: { ids: ['1', '2', '5'] } })).json;
    assert.equal(done.changed, 2, 'only ticked devices from the preview change; one set by hand does not');
    const after = loadState(srv.db);
    assert.deepEqual(after.objs.map(o => [o.name, o.type]), [['NB-1', 'notebook'], ['CAM-1', 'camera'], ['NB-2', 'pc'], ['NB-3', 'pc'], ['PC-HAND', 'pc'], ['NB-OWN', 'pc']]);
    assert.match(after.history['1'][0].msg, /^Type changed from pc to notebook by the type rules/);
    assert.ok(srv.db.prepare("SELECT 1 FROM backups WHERE reason = 'before applying the type rules'").get(), 'a backup first');
    // a change by the rules does not count as set by hand: the next preview may change it again
    assert.ok(!(await srv.call('POST', '/api/feed/retype', { cookie: a.cookie, body: {} })).json.changes.some(x => x.id === '1'));
  } finally { await srv.close(); }
});
