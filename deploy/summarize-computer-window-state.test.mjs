import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeComputerWindowState } from './summarize-computer-window-state.mjs';

test('reports bounded control classes and tree completeness without raw labels', () => {
  const privateLabel = 'fixture-secret-value';
  const summary = summarizeComputerWindowState({
    elements: [
      {
        role: 'Text Entry',
        label: `Input ${privateLabel}`,
        element_token: 'opaque-token',
        frame: { x: 10, y: 20, w: 30, h: 40 },
        actions: ['click', 'set_value'],
      },
      { role: 'push button', label: 'Submit' },
    ],
    elements_complete: false,
    truncated: true,
    nodes_visited: 7,
    nodes_pending: 3,
  });

  assert.equal(summary.windowStateElementCount, 2);
  assert.equal(summary.windowStateElementsComplete, false);
  assert.equal(summary.windowStateTruncated, true);
  assert.equal(summary.windowStateNodesVisited, 7);
  assert.equal(summary.windowStateNodesPending, 3);
  assert.deepEqual(summary.windowStateElementSummaries, [
    {
      roleClass: 'input',
      labelClass: 'input',
      hasElementToken: true,
      hasFrame: true,
      actionCount: 2,
    },
    {
      roleClass: 'button',
      labelClass: 'submit',
      hasElementToken: false,
      hasFrame: false,
      actionCount: null,
    },
  ]);
  assert.equal(JSON.stringify(summary).includes(privateLabel), false);
});

test('keeps missing or malformed tree metadata bounded', () => {
  assert.deepEqual(summarizeComputerWindowState({ elements: 'not-an-array' }), {
    windowStateElementCount: 0,
    windowStateElementsComplete: null,
    windowStateTruncated: null,
    windowStateNodesVisited: null,
    windowStateNodesPending: null,
    windowStateElementSummaries: [],
  });
});
