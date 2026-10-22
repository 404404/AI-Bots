import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyComputerToolError } from './classify-computer-tool-error.mjs';

test('classifies sanitized MCP tool errors', () => {
  assert.equal(
    classifyComputerToolError({
      isError: true,
      structuredContent: { error: { code: 'window_not_found' } },
    }),
    'window-not-found',
  );
  assert.equal(
    classifyComputerToolError({
      content: [{ type: 'text', text: 'AT-SPI accessibility bus is unavailable' }],
    }),
    'accessibility-unavailable',
  );
});

test('classifies thrown tool errors without returning their message', () => {
  const secretLikeDetail = 'fixture text must not appear in reports';
  const classification = classifyComputerToolError(
    Object.assign(new Error(`request timed out: ${secretLikeDetail}`), { code: 'ETIMEDOUT' }),
  );

  assert.equal(classification, 'timeout');
  assert.equal(JSON.stringify({ classification }).includes(secretLikeDetail), false);
});

test('uses tool-error for unknown failures', () => {
  assert.equal(classifyComputerToolError(new Error('opaque driver failure')), 'tool-error');
  assert.equal(
    classifyComputerToolError({ message: 'opaque driver failure', content: 'not-an-array' }),
    'tool-error',
  );
});
