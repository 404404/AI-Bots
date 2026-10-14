import { describe, expect, it } from 'vitest';

import { createHostClient } from '../src/host/client';
import { pairWithLiveHost } from './live-pairing';
import { nodeCarrier } from './node-carrier';

const live = process.env['MOBILE_LIVE_HOST_URL'];

describe.skipIf(live === undefined)('attachments against a live isolated Host', () => {
  it('uploads a file through the device gateway and gets a Channel attachment back', async () => {
    const { host } = await pairWithLiveHost(live!, 'mobile attachment live test');
    const client = createHostClient({
      routes: host.routes,
      credential: host.credential,
      carrier: nodeCarrier(),
    });
    const text = `mobile attachment ${Date.now()}`;
    const ref = await client.upload('note.txt', new Blob([text]));
    expect(ref).toMatchObject({ name: 'note.txt', size: text.length });
    expect(ref.mime).toMatch(/^text\/plain/u);
    expect(ref.fileId ?? ref.hash).toMatch(/^(file|sha256):/u);
  });
});
