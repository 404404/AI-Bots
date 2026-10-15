import { describe, expect, it } from 'vitest';

import type { HostApiAnswer, HostApiInit } from '../src/host/client';
import { createComputerViewer, type ComputerViewerState } from '../src/host/computer-viewer';

type Call = { path: string; body?: Record<string, unknown> };

function host(answers: ((call: Call) => HostApiAnswer | Promise<HostApiAnswer>)[]) {
  const calls: Call[] = [];
  let next = 0;
  return {
    calls,
    client: {
      async api(path: string, init: HostApiInit = {}) {
        const call: Call = {
          path,
          ...(init.body === undefined ? {} : { body: init.body }),
        };
        calls.push(call);
        const answer = answers[Math.min(next, answers.length - 1)]!;
        next += 1;
        if (init.signal?.aborted === true) throw new Error('cancelled');
        return answer(call);
      },
    },
  };
}

const frame = (seq: number): HostApiAnswer => ({
  status: 200,
  body: {
    ok: true,
    target: 'local',
    seq,
    mimeType: 'image/png',
    data: 'cG5n',
    width: 1440,
    height: 900,
  },
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function watch(
  viewer: ReturnType<typeof createComputerViewer>,
  until: (state: ComputerViewerState) => boolean,
) {
  return new Promise<ComputerViewerState>((resolve) => {
    const stop = viewer.subscribe(() => {
      const state = viewer.getState();
      if (until(state)) {
        stop();
        resolve(state);
      }
    });
  });
}

describe('Computer viewer', () => {
  it('long-polls desktop frames after the last sequence it saw', async () => {
    const fake = host([() => frame(1), () => ({ status: 204, body: undefined }), () => frame(2)]);
    const viewer = createComputerViewer({
      client: fake.client,
      wait: async () => undefined,
    });
    const second = watch(viewer, (state) => state.frame?.seq === 2);
    viewer.start();
    const state = await second;
    viewer.stop();
    expect(state).toMatchObject({
      status: 'live',
      control: false,
      frame: {
        seq: 2,
        uri: 'data:image/png;base64,cG5n',
        width: 1440,
        height: 900,
      },
    });
    expect(fake.calls.slice(0, 3).map((call) => call.path)).toEqual([
      '/api/computer/frame',
      '/api/computer/frame?after=1',
      '/api/computer/frame?after=1',
    ]);
  });

  it('shows a stopped Computer and starts over when it comes back', async () => {
    const fake = host([
      () => ({
        status: 409,
        body: { ok: false, code: 'not-running', error: 'stopped' },
      }),
      () => frame(5),
    ]);
    const viewer = createComputerViewer({
      client: fake.client,
      wait: async () => undefined,
    });
    const stopped = watch(viewer, (state) => state.status === 'not-running');
    viewer.start();
    await stopped;
    await watch(viewer, (state) => state.status === 'live');
    viewer.stop();
    expect(fake.calls[1]!.path).toBe('/api/computer/frame');
  });

  it('pauses the Bot before sending input and hands back when the screen closes', async () => {
    const fake = host([
      (call) =>
        call.path === '/api/computer/input'
          ? { status: 200, body: { ok: true } }
          : call.path === '/api/computer/takeover'
            ? { status: 200, body: { ok: true, paused: call.body?.['active'] === true } }
            : frame(1),
    ]);
    const viewer = createComputerViewer({
      client: fake.client,
      wait: async () => undefined,
    });
    viewer.start();
    await watch(viewer, (state) => state.status === 'live');
    await viewer.send({ kind: 'click', x: 3, y: 4 });
    await viewer.setControl(true);
    expect(viewer.getState().control).toBe(true);
    await viewer.send({ kind: 'click', x: 3, y: 4 });
    viewer.stop();
    await settle();
    expect(fake.calls.filter((call) => !call.path.startsWith('/api/computer/frame'))).toEqual([
      { path: '/api/computer/takeover', body: { active: true } },
      { path: '/api/computer/input', body: { kind: 'click', x: 3, y: 4 } },
      { path: '/api/computer/takeover', body: { active: false } },
    ]);
    expect(viewer.getState().control).toBe(false);
  });
});
