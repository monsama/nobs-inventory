/* Roles from groups: the first rule that matches gives role and sites; AD names, DNs and Entra IDs all match. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGroupRole, groupMatches, groupRolesProblem, roleFromGroups } from '../public/js/group-roles.js';

test('groups match by name, distinguished name or ID, in any case', () => {
  assert.ok(groupMatches({ group: 'IT-Bern' }, ['CN=it-bern,OU=Groups,DC=corp']));
  assert.ok(groupMatches({ group: 'CN=IT-Bern,OU=X,DC=corp' }, ['it-bern']));
  assert.ok(groupMatches({ group: '0f6c…-id' }, ['0F6C…-ID']));
  assert.ok(!groupMatches({ group: 'IT' }, ['IT-Bern']));
  assert.deepEqual(roleFromGroups([{ group: 'a', role: 'viewer' }, { group: 'b', role: 'editor', sites: ['Bern'] }], ['b', 'a']), { role: 'viewer', sites: [], group: 'a' }, 'the first rule counts');
});
test('a rule gives and takes back; a hand-given role and admins stay', () => {
  const rules = [{ group: 'IT-Bern', role: 'editor', sites: ['Bern'] }];
  const u = { role: 'none', own: true };
  assert.equal(applyGroupRole(u, rules, ['IT-Bern']), true);
  assert.deepEqual(u, { role: 'editor', roleBy: 'IT-Bern', sites: ['Bern'] });
  assert.equal(applyGroupRole(u, rules, ['IT-Bern']), false, 'nothing changed');
  assert.equal(applyGroupRole(u, rules, []), true);
  assert.deepEqual(u, { role: 'none' });
  const hand = { role: 'viewer' }; applyGroupRole(hand, rules, []); assert.equal(hand.role, 'viewer');
  const admin = { role: 'admin' }; applyGroupRole(admin, rules, ['IT-Bern']); assert.equal(admin.role, 'admin');
  assert.equal(groupRolesProblem([{ group: 'x', role: 'admin' }]), 'A group gives the role editor or viewer.');
  assert.equal(groupRolesProblem([{ group: 'x', role: 'viewer', sites: ['Bern'] }]), '');
});
