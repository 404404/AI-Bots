import { createHash } from 'node:crypto';
import type { DevicesSnapshot } from './http.js';
import type { HostIdentity, PairedDevice, PairingOfferStatus } from './pairing.js';
import type { RouteStatus } from './routes.js';
export function deviceIdentity(device: PairedDevice): string {
  return createHash('sha256')
    .update(JSON.stringify([device.id, device.name, device.pairedAt, device.revokedAt ?? null]))
    .digest('hex');
}
export function routeStatusView(status: RouteStatus) {
  return {
    routes: status.routes.map((route) => ({
      url: route.url,
      kind: route.kind,
      ready: route.ready,
      ...(route.issue === undefined ? {} : { issue: route.issue }),
    })),
    tailscale: status.tailscale,
    serveCommand: status.serveCommand,
  };
}
export function deviceRoutesView(host: HostIdentity, status: RouteStatus) {
  return { host: { id: host.id, name: host.name }, ...routeStatusView(status) };
}
export function offerStatusView(status: PairingOfferStatus) {
  return {
    receiptId: status.receiptId,
    status: status.status,
    ...(status.expiresAt === undefined ? {} : { expiresAt: status.expiresAt }),
    ...(status.deviceId === undefined ? {} : { deviceId: status.deviceId }),
  };
}
export function devicesView(snapshot: DevicesSnapshot) {
  return {
    host: { id: snapshot.host.id, name: snapshot.host.name },
    devices: snapshot.devices.map((device) => ({
      id: device.id,
      name: device.name,
      pairedAt: device.pairedAt,
      ...(device.lastSeenAt === undefined ? {} : { lastSeenAt: device.lastSeenAt }),
      ...(device.revokedAt === undefined ? {} : { revokedAt: device.revokedAt }),
      identity: deviceIdentity(device),
    })),
    routes: routeStatusView(snapshot.routes),
    ...(snapshot.pendingOffer === undefined
      ? {}
      : { pendingOffer: offerStatusView(snapshot.pendingOffer) }),
  };
}
