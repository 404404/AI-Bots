import { deviceIdentity, devicesView, deviceRoutesView } from '../devices/views.js';
import type { DevicePairing } from '../devices/pairing.js';
import type { RouteStatus } from '../devices/routes.js';
import type { PrepareTobOperation } from './cli-operations.js';
import { TobError } from './service.js';
export const TOB_DEVICE_CAPABILITIES = [
  {
    command: 'devices',
    description: 'Read paired devices and identity fingerprints',
    write: false,
  },
  {
    command: 'device-routes',
    description: 'Read phone reachability without changing networking',
    write: false,
  },
  {
    command: 'device-offer',
    description: 'Create a receipt; Human sees the link only in Devices UI',
    write: true,
  },
  {
    command: 'device-offer-status',
    description: 'Read receipt settlement or expiry without tokens',
    write: false,
  },
  {
    command: 'device-revoke',
    description: 'Revoke one identity-reviewed device and close its streams',
    write: true,
  },
];
export function createTobDeviceOperations(
  pairing: DevicePairing,
  routes: () => Promise<RouteStatus>,
): PrepareTobOperation {
  return async (command, args) => {
    if (!TOB_DEVICE_CAPABILITIES.some((entry) => entry.command === command)) return undefined;
    const allowed =
      command === 'device-revoke'
        ? ['deviceId', 'expectedDevice', 'confirm']
        : command === 'device-offer-status'
          ? ['receiptId']
          : [];
    if (
      Object.keys(args).length !== allowed.length ||
      allowed.some((key) => !Object.hasOwn(args, key))
    )
      throw new TobError('invalid-input');
    if (command === 'device-offer-status') {
      if (typeof args.receiptId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(args.receiptId))
        throw new TobError('invalid-input');
      return {
        run(guard) {
          guard();
          return pairing.offerStatus(args.receiptId as string);
        },
      };
    }
    if (command === 'device-revoke') {
      if (args.confirm !== true) throw new TobError('confirmation-required');
      const device = pairing.list().find((entry) => entry.id === args.deviceId);
      if (!device) throw new TobError('device-unknown');
      if (deviceIdentity(device) !== args.expectedDevice) throw new TobError('stale-device');
      if (device.revokedAt !== undefined)
        return {
          run(guard) {
            guard();
            return { revoked: false, alreadyRevoked: true, closedStreams: 0 };
          },
        };
      return {
        proposal: Object.freeze({
          command,
          target: device.id,
          previousValue: device,
          patch: { revoked: true },
        }),
        run(guard, beforeEffect) {
          guard();
          const current = pairing.list().find((entry) => entry.id === device.id);
          if (!current || deviceIdentity(current) !== args.expectedDevice)
            throw new TobError('stale-device');
          beforeEffect?.();
          return current.revokedAt === undefined
            ? pairing.revoke(device.id)
            : { revoked: false, alreadyRevoked: true, closedStreams: 0 };
        },
      };
    }
    if (command === 'device-offer')
      return {
        proposal: Object.freeze({
          command,
          target: 'paired-devices',
          previousValue: null,
          patch: { createOffer: true },
        }),
        async run(guard, beforeEffect) {
          guard();
          const routeStatus = await routes();
          guard();
          beforeEffect?.();
          const offer = pairing.createOffer();
          return {
            receiptId: offer.receiptId,
            expiresAt: offer.expiresAt,
            status: 'pending',
            reachable: routeStatus.routes.some(
              (route) => route.kind === 'tailscale' && route.ready,
            ),
            handoff: 'Settings → Devices → Pair a phone',
          };
        },
      };
    return {
      async run(guard) {
        guard();
        const status = await routes();
        guard();
        const pending = pairing.currentOffer();
        return command === 'devices'
          ? devicesView({
              host: pairing.host(),
              devices: pairing.list(),
              routes: status,
              ...(pending === undefined
                ? {}
                : { pendingOffer: pairing.offerStatus(pending.receiptId) }),
            })
          : deviceRoutesView(pairing.host(), status);
      },
    };
  };
}
