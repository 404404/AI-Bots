import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { deviceIdentity } from '../src/devices/views.js';
import { createTobDeviceOperations } from '../src/tob/cli-device-operations.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
it('keeps offer secrets outside reviewed proposals and rechecks device identity after review', async () => {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('tob-device-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'QA Host',
  });
  const prepare = createTobDeviceOperations(pairing, async () => ({
    routes: [],
    tailscale: 'missing',
    serveCommand: 'diagnostic',
  }));
  const offer = await prepare('device-offer', {});
  expect(offer?.proposal).toBeDefined();
  let effects = 0;
  const receipt = await offer!.run(
    () => {},
    () => effects++,
  );
  const secret = pairing.currentOffer()!.offer;
  expect(JSON.stringify([offer?.proposal, receipt])).not.toContain(secret);
  const paired = pairing.redeem({ offer: secret, name: 'QA phone' });
  if (!paired.ok) throw new Error('pair failed');
  let guarded = 0;
  const revoke = await prepare('device-revoke', {
    deviceId: paired.device.id,
    expectedDevice: deviceIdentity(paired.device),
    confirm: true,
  });
  pairing.revoke(paired.device.id);
  expect(() => revoke!.run(() => guarded++)).toThrow(
    expect.objectContaining({ code: 'stale-device' }),
  );
  expect(effects).toBe(1);
  expect(guarded).toBe(1);
  await expect(
    prepare('device-revoke', { deviceId: 'unknown', expectedDevice: 'x', confirm: true }),
  ).rejects.toMatchObject({ code: 'device-unknown' });
  await expect(
    offer!.run(() => {
      throw new Error('authority lost');
    }),
  ).rejects.toThrow('authority lost');
});
