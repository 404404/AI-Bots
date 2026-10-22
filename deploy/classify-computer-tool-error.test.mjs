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
  assert.equal(
    classifyComputerToolError({
      isError: true,
      structuredContent: {
        status: 'refused',
        refusal: { code: 'snapshot_id_required', message: 'fresh snapshot required' },
      },
    }),
    'snapshot-required',
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

test('keeps explicit background refusal distinct from permission denial', () => {
  assert.equal(
    classifyComputerToolError({ structuredContent: { code: 'background_unavailable' } }),
    'background-unavailable',
  );
  assert.equal(
    classifyComputerToolError({ structuredContent: { code: 'permission_denied' } }),
    'permission-denied',
  );
});

test('uses tool-error for unknown failures', () => {
  assert.equal(classifyComputerToolError(new Error('opaque driver failure')), 'tool-error');
  assert.equal(
    classifyComputerToolError({ message: 'opaque driver failure', content: 'not-an-array' }),
    'tool-error',
  );
});
