/* Links on devices: web pages, remote access and shares are taken; anything that could run in the page is not. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkKind, linkHref, linksProblem } from '../public/js/links.js';
import { checkState } from '../server/state.js';

test('the kinds of address a link may be', () => {
  for (const url of ['https://10.0.0.5', 'http://printer.local:8080/admin', 'ssh://admin@sw-core', 'rdp://hv-01', 'vnc://10.0.0.9', 'smb://nas/share', 'ftp://ftp.example.ch', '\\\\nas01\\scans', '\\\\nas01']) {
    assert.equal(linksProblem([{ url }]), null, url);
  }
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', 'not a link', '', 'https://' + 'x'.repeat(500)]) {
    assert.ok(linksProblem([{ url }]), url);
  }
  assert.ok(linksProblem([{ url: 'https://a', label: 'x'.repeat(61) }]));
  assert.ok(linksProblem(Array.from({ length: 21 }, (_, i) => ({ url: 'https://h' + i }))));
});

test('a link reads as its kind and a share opens as file://', () => {
  assert.deepEqual(['https://a', 'ssh://a', '\\\\nas\\x', 'rdp://h'].map(linkKind), ['Web', 'SSH', 'Share', 'RDP']);
  assert.equal(linkHref('\\\\nas01\\scans\\2026'), 'file://nas01/scans/2026');
  assert.equal(linkHref('https://10.0.0.5'), 'https://10.0.0.5');
});

test('the server refuses a device with a link that could run in the page', () => {
  const s = { objs: [{ id: 'o1', code: 'INV-0001', type: 'pc', name: 'PC-1', status: 'active', ovr: {}, urls: [{ url: 'javascript:alert(1)' }] }], rels: [], users: [], types: {}, history: {}, locs: [] };
  assert.throws(() => checkState(s), e => e.status === 400 && /not allowed/.test(e.message));
  s.objs[0].urls = [{ label: 'Web interface', url: 'https://10.0.0.5' }];
  assert.doesNotThrow(() => checkState(s));
});
