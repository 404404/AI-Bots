import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorizeTarget, classifyAddress, parseTargetRules } from '../src/policy.mjs';

const rule = 'http://fixture.test:8081';
const rules = parseTargetRules({ [rule]: { addresses: ['172.31.240.10'], allowPrivate: true } });

test('exact origin maps only to a configured static private fixture IP', async () => {
  const resolved = await authorizeTarget(`${rule}/page?x=1`, rules, async () => [{ address: '172.31.240.10', family: 4 }]);
  assert.equal(resolved.address, '172.31.240.10');
  assert.equal(resolved.url.pathname, '/page');
});

test('every DNS answer is checked; changed and mixed answers fail closed', async () => {
  await assert.rejects(
    authorizeTarget(rule, rules, async () => [{ address: '172.31.240.11', family: 4 }]),
    { code: 'target-address-changed' },
  );
  await assert.rejects(
    authorizeTarget(rule, rules, async () => [
      { address: '172.31.240.10', family: 4 }, { address: '169.254.169.254', family: 4 },
    ]),
    { code: 'target-address-denied' },
  );
});

test('the address classifier blocks private, loopback, link-local and mapped private IPv6', () => {
  assert.equal(classifyAddress('10.1.2.3'), 'private');
  assert.equal(classifyAddress('127.0.0.1'), 'loopback');
  assert.equal(classifyAddress('169.254.169.254'), 'link-local');
  assert.equal(classifyAddress('::ffff:192.168.1.1'), 'private');
  assert.equal(classifyAddress('::ffff:c0a8:0101'), 'private');
  assert.equal(classifyAddress('0:0:0:0:0:0:0:1'), 'loopback');
  assert.equal(classifyAddress('0:0:0:0:0:0:0:0'), 'reserved');
  assert.equal(classifyAddress('0:0:0:0:0:ffff:7f00:1'), 'loopback');
  assert.equal(classifyAddress('64:ff9b::a9fe:a9fe'), 'reserved');
  assert.equal(classifyAddress('64:ff9b:1::a9fe:a9fe'), 'reserved');
  assert.equal(classifyAddress('2002:a9fe:a9fe::1'), 'reserved');
  assert.equal(classifyAddress('2001:0:4136:e378:8000:63bf:3fff:fdd2'), 'reserved');
  assert.equal(classifyAddress('::169.254.169.254'), 'reserved');
  assert.equal(classifyAddress('fd00:0ec2:0:0:0:0:0:254'), 'private');
  assert.equal(classifyAddress('2001:4860:4860::8888'), 'public');
  assert.equal(classifyAddress('2001:db8::1'), 'reserved');
});

test('metadata and reserved ranges cannot be placed in explicit allow rules', () => {
  for (const address of ['169.254.169.254', '100.100.100.200', 'fd00:ec2::254', 'fd00:0ec2:0:0:0:0:0:254', '100.64.0.1', '64:ff9b::a9fe:a9fe']) {
    assert.throws(() => parseTargetRules({ [rule]: { addresses: [address], allowPrivate: true } }), { code: 'invalid-target-rules' });
  }
  assert.throws(() => parseTargetRules({ 'http://fixture.test:8081/child': { addresses: ['172.31.240.10'], allowPrivate: true } }), { code: 'invalid-target-rules' });
});

test('expanded IPv6 metadata destination is rejected even when ULA ranges are opted in', async () => {
  const privateRules = parseTargetRules({ [rule]: { addresses: ['fd00:ec2::255'], allowPrivate: true } });
  await assert.rejects(
    authorizeTarget(rule, privateRules, async () => [{ address: 'fd00:0ec2:0:0:0:0:0:254', family: 6 }]),
    { code: 'target-address-denied' },
  );
});

test('credentials, non-http protocols, trailing-dot names and unapproved origins are rejected', async () => {
  await assert.rejects(authorizeTarget('http://user:pass@fixture.test:8081/', rules), { code: 'invalid-target' });
  await assert.rejects(authorizeTarget('file:///etc/passwd', rules), { code: 'target-protocol-denied' });
  await assert.rejects(authorizeTarget('http://fixture.test.:8081/', rules), { code: 'invalid-target' });
  await assert.rejects(authorizeTarget('http://other.test:8081/', rules), { code: 'target-origin-denied' });
});
