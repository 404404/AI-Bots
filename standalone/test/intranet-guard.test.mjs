import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPrivateOrLoopbackAddress } from '../src/network-access.ts';

const sample = readFileSync(new URL('../deploy/gk50-intranet.nft', import.meta.url), 'utf8');
const ipv4Cidrs = [
  '127.0.0.0/8',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '100.64.0.0/10',
];

test('GK50 intranet guard scopes the historical reject exception to the app IPv4 networks', () => {
  assert.match(sample, /table inet gk50_bots_lan\s*\{/u);
  assert.match(sample, /chain input\s*\{/u);
  assert.match(sample, /type filter hook input priority -10; policy accept;/u);
  assert.match(sample, /ip daddr 192\.168\.68\.11 tcp dport 20443/u);
  assert.match(sample, /ip saddr != 127\.0\.0\.0\/8 ip saddr != 10\.0\.0\.0\/8 ip saddr != 172\.16\.0\.0\/12 ip saddr != 192\.168\.0\.0\/16 ip saddr != 100\.64\.0\.0\/10 counter reject with tcp reset/u);
  const sourceExclusions = [...sample.matchAll(/ip saddr != ([0-9.]+\/\d+)/gu)].map((match) => match[1]);
  assert.deepEqual(sourceExclusions, ipv4Cidrs);

  assert.deepEqual(
    ipv4Cidrs.map((cidr) => cidr.split('/')[0]).map(isPrivateOrLoopbackAddress),
    ipv4Cidrs.map(() => true),
  );
  for (const address of ['8.8.8.8', '9.0.0.1', '172.32.0.1', '100.128.0.1']) {
    assert.equal(isPrivateOrLoopbackAddress(address), false, address);
  }
  assert.doesNotMatch(sample, /flush ruleset|\btcp dport (?!20443\b)\d+|\budp dport\b/iu);
});
