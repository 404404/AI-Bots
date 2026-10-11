import { describe, expect, it } from 'vitest';
import { projectPrivateInputEvents } from '../../../scripts/export-private-input-evidence.mjs';

describe('public native Session evidence', () => {
  it('only exports linked reference/status facts, excluding arbitrary Session text and subprocess projections', () => {
    const secret = 'SYNTHETIC-should-never-be-exported';
    const ref = 'private:76a6fe17-1111-2222-3333-444444444444:api_key';
    const events = [
      {
        type: 'tool/call',
        data: {
          callId: 'call_a',
          name: 'ask_secret',
          arguments: JSON.stringify({
            account: secret,
            fields: [{ id: 'api_key', label: secret, required: true }],
          }),
        },
      },
      {
        type: 'tool/result',
        data: {
          message: {
            toolCallId: 'call_a',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'configured',
                  account: secret,
                  references: { api_key: ref },
                  secret,
                }),
              },
            ],
          },
        },
      },
      { type: 'assistant/message', data: { message: secret } },
      { type: 'request/header', data: { header: { authorization: secret } } },
      {
        type: 'tool/call',
        data: { callId: 'call_b', name: 'bash', arguments: { command: secret, workdir: secret } },
      },
      {
        type: 'tool/result',
        data: {
          message: {
            toolCallId: 'call_b',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  kind: 'foreground',
                  exitCode: 7,
                  stdout: { text: secret },
                  stderr: { text: secret },
                }),
              },
            ],
          },
        },
      },
    ].map((event, seq) => ({ ...event, seq, time: Date.parse('2026-10-11T10:00:00.000Z') }));
    const result = projectPrivateInputEvents(events);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result).toHaveLength(5);
    expect(result[1]).toMatchObject({
      value: { status: 'configured', references: { api_key: ref } },
    });
    expect(result[4]).toMatchObject({ value: { kind: 'foreground', exitCode: 7 } });
  });
});
