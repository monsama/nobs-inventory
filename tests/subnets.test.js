import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subnetProblem, ipInt } from '../public/js/net.js';

const ok = { name: 'Users', vid: 10, cidr: '10.10.20.0/24', gateway: '10.10.20.1', dns: ['10.10.1.5'], ranges: [{ from: '10.10.20.50', to: '10.10.20.99', use: 'DHCP' }], types: ['pc'] };

test('a subnet on a VLAN with its gateway, DNS and ranges inside it is accepted', () => {
  assert.equal(subnetProblem(ok), null);
  assert.equal(subnetProblem({ ...ok, vid: null, gateway: '', dns: [], ranges: [] }), null);
});

test('a subnet is written by its first address, and the gateway and ranges are inside it', () => {
  assert.match(subnetProblem({ ...ok, cidr: '10.10.20.5/24' }), /first address/);
  assert.match(subnetProblem({ ...ok, gateway: '10.10.21.1' }), /gateway/);
  assert.match(subnetProblem({ ...ok, ranges: [{ from: '10.10.20.99', to: '10.10.20.50' }] }), /range/);
  assert.match(subnetProblem({ ...ok, ranges: [{ from: '10.10.19.50', to: '10.10.20.99' }] }), /range/);
});

test('a prefix outside /8 to /30, a bad VLAN and a bad DNS address are refused', () => {
  assert.match(subnetProblem({ ...ok, cidr: '10.0.0.0/4' }), /prefix/);
  assert.match(subnetProblem({ ...ok, vid: 5000 }), /VLAN/);
  assert.match(subnetProblem({ ...ok, dns: ['dns.local'] }), /DNS/);
});

test('an IPv4 address is read as a number and a bad one is not', () => {
  assert.equal(ipInt('10.0.0.1'), 167772161);
  assert.equal(ipInt('10.0.0.256'), null);
  assert.equal(ipInt('x'), null);
});

test('picking an address takes the first free one in the ranges, and says so when they are full', async () => {
  const { freeAddress, ipInt } = await import('../public/js/net.js');
  const sub = { ranges: [{ from: '10.10.20.1', to: '10.10.20.3' }, { from: '10.10.20.10', to: '10.10.20.11' }] };
  assert.equal(freeAddress(sub, new Set([ipInt('10.10.20.1'), ipInt('10.10.20.2')])), '10.10.20.3');
  assert.equal(freeAddress(sub, new Set([ipInt('10.10.20.1'), ipInt('10.10.20.2'), ipInt('10.10.20.3')])), '10.10.20.10');
  assert.equal(freeAddress({ ranges: [{ from: '10.0.0.1', to: '10.0.0.1' }] }, new Set([ipInt('10.0.0.1')])), null);
});

test('two subnets that share an address are refused, and neighbouring ones are not', async () => {
  const { overlapProblem, subnetSpan, ipInt } = await import('../public/js/net.js');
  const first = ipInt('10.10.20.0');
  assert.deepEqual(subnetSpan({ cidr: '10.10.20.0/24' }), { first, last: first + 255 });
  assert.match(overlapProblem([{ name: 'A', cidr: '10.10.20.0/24' }, { name: 'B', cidr: '10.10.20.128/25' }]), /overlaps/);
  assert.equal(overlapProblem([{ name: 'A', cidr: '10.10.20.0/24' }, { name: 'B', cidr: '10.10.21.0/24' }]), null);
});
