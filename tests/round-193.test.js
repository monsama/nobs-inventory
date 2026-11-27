/* Sweep 0.9.193: a merge by hand takes nothing that signs in from a switched-off record, and a merged login is never
   the alias cut at 20. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePeople } from '../public/js/people-match.js';

test('a switched-off record lends no login, Entra id or mail address', () => {
  const s = { objs: [], history: {}, users: [
    { id: 'ls', name: 'Anna Muster', source: 'lansweeper', role: 'viewer', active: true },
    { id: 'off', name: 'Anna Muster', login: 'amuster', source: 'manual', role: 'viewer', active: false, entra: { id: 'oid-1', upn: 'a@x.ch' }, profile: { mail: 'a@x.ch' } }] };
  mergePeople(s, 'ls', 'off');
  const k = s.users[0];
  assert.equal(k.login, undefined); assert.equal(k.entra, undefined); assert.equal(k.profile, undefined);
  assert.ok(k.aliases.includes('amuster'), 'the login stays an alias, for the syncs');
});

test('a live record still lends its login', () => {
  const s = { objs: [], history: {}, users: [{ id: 'k', name: 'Anna Muster', source: 'lansweeper', active: true }, { id: 'd', name: 'A M', login: 'amuster', source: 'manual', active: true }] };
  mergePeople(s, 'k', 'd');
  assert.equal(s.users[0].login, 'amuster');
});

test('a merged login is kept when the aliases are full', () => {
  const s = { objs: [], history: {}, users: [
    { id: 'k', name: 'Anna Muster', login: 'am', source: 'ldap', active: true, aliases: Array.from({ length: 20 }, (_, i) => 'old' + i) },
    { id: 'd', name: 'Anna M', login: 'anna.m', source: 'manual', active: true }] };
  mergePeople(s, 'k', 'd');
  assert.equal(s.users[0].aliases.length, 20);
  assert.ok(s.users[0].aliases.includes('anna.m'));
});
