import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCliHostTarget } from './cli-host-target.mjs';

test('CLI host target defaults to the launch origin and allows a plain loopback proxy origin', () => {
  assert.equal(resolveCliHostTarget('http://192.0.2.10:3080', undefined), 'http://192.0.2.10:3080');
  assert.equal(
    resolveCliHostTarget('http://192.0.2.10:3080', 'http://127.0.0.1:50123'),
    'http://127.0.0.1:50123',
  );
});

test('CLI host override rejects non-loopback targets and token-bearing URLs', () => {
  for (const target of [
    'https://127.0.0.1:50123',
    'http://localhost:50123',
    'http://192.0.2.1:50123',
    'http://user:password@127.0.0.1:50123',
    'http://127.0.0.1:50123/api?token=secret',
  ])
    assert.throws(() => resolveCliHostTarget('http://192.0.2.10:3080', target), /loopback origin/u);
});
