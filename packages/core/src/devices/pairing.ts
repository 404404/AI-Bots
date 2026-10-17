import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { OperationalDatabaseModulePort } from '../database/owner.js';

export const PAIRING_OFFER_TTL_MS = 5 * 60 * 1000;
const LAST_SEEN_RESOLUTION_MS = 60 * 1000;
const MAX_OPEN_OFFERS = 16;
const DEVICE_NAME_MAX = 60;

export interface HostIdentity {
  id: string;
  name: string;
}

export interface PairedDevice {
  id: string;
  name: string;
  pairedAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
}

export interface PairingOffer {
  offer: string;
  receiptId: string;
  expiresAt: string;
}

export interface PairingOfferStatus {
  receiptId: string;
  status: 'pending' | 'redeemed' | 'expired' | 'unknown';
  expiresAt?: string;
  deviceId?: string;
}

export type OfferRefusal = 'offer-invalid' | 'offer-expired';
export type DeviceRefusal = 'device-credential-missing' | 'device-unknown' | 'device-revoked';

export type Redemption =
  | { ok: true; device: PairedDevice; credential: string; host: HostIdentity }
  | { ok: false; code: OfferRefusal };

export type Admission = { ok: true; device: PairedDevice } | { ok: false; code: DeviceRefusal };

export type DevicePairingEvent =
  | { phase: 'offer-created' | 'offer-expired' | 'offer-refused' }
  | { phase: 'offer-redeemed' | 'device-admitted'; deviceId: string }
  | { phase: 'device-refused'; code: DeviceRefusal; deviceId?: string }
  | { phase: 'device-revoked'; deviceId: string; closedStreams: number };

export interface DevicePairing {
  host(): HostIdentity;
  createOffer(): PairingOffer;
  currentOffer(): PairingOffer | undefined;
  offerStatus(receiptId: string): PairingOfferStatus;
  redeem(input: { offer: string; name?: string }): Redemption;
  admit(authorization: string | undefined): Admission;
  check(deviceId: string): Admission;
  list(): PairedDevice[];
  revoke(deviceId: string): { revoked: boolean; closedStreams: number };
  attachStream(deviceId: string, close: () => void): () => void;
}

export interface DevicePairingOptions {
  database: OperationalDatabaseModulePort;
  hostName: string;
  now?: () => number;
  record?: (event: DevicePairingEvent) => void;
  onRevoked?: (deviceId: string) => void;
}

interface Row {
  device_id: string;
  name: string;
  secret_hash: string;
  paired_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

const CREDENTIAL = /^Device ([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{32,128})$/u;

const token = (bytes: number): string => randomBytes(bytes).toString('base64url');
const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

function device(row: Row): PairedDevice {
  return {
    id: row.device_id,
    name: row.name,
    pairedAt: row.paired_at,
    ...(row.last_seen_at === null ? {} : { lastSeenAt: row.last_seen_at }),
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
  };
}

function deviceName(input: string | undefined): string {
  const name = (input ?? '')
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return name === '' ? 'Phone' : [...name].slice(0, DEVICE_NAME_MAX).join('');
}

export function createDevicePairing(options: DevicePairingOptions): DevicePairing {
  const { database } = options;
  const now = options.now ?? Date.now;
  const record = options.record ?? (() => {});
  const iso = (ms: number): string => new Date(ms).toISOString();

  const offers = new Map<string, PairingOffer>();
  const receipts = new Map<string, PairingOfferStatus>();
  const streams = new Map<string, Set<() => void>>();

  const sweep = (): void => {
    for (const [key, offer] of offers)
      if (Date.parse(offer.expiresAt) <= now()) {
        offers.delete(key);
        receipts.set(offer.receiptId, {
          receiptId: offer.receiptId,
          status: 'expired',
          expiresAt: offer.expiresAt,
        });
        record({ phase: 'offer-expired' });
      }
  };

  const row = (deviceId: string): Row | undefined =>
    database.read(
      (connection) =>
        connection.prepare('SELECT * FROM paired_devices WHERE device_id = ?').get(deviceId) as
          | Row
          | undefined,
    );

  const active = (current: Row): Admission => {
    if (current.revoked_at !== null) {
      record({ phase: 'device-refused', code: 'device-revoked', deviceId: current.device_id });
      return { ok: false, code: 'device-revoked' };
    }
    const seen = now();
    const last = current.last_seen_at === null ? 0 : Date.parse(current.last_seen_at);
    if (seen - last >= LAST_SEEN_RESOLUTION_MS) {
      current.last_seen_at = iso(seen);
      database.transaction(
        (connection) =>
          connection
            .prepare(
              'UPDATE paired_devices SET last_seen_at = ? WHERE device_id = ? AND revoked_at IS NULL',
            )
            .run(current.last_seen_at, current.device_id),
        ['paired-devices'],
      );
      record({ phase: 'device-admitted', deviceId: current.device_id });
    }
    return { ok: true, device: device(current) };
  };

  const host = (): HostIdentity => {
    const existing = database.read(
      (connection) =>
        connection.prepare('SELECT host_id FROM device_pairing_host WHERE singleton = 1').get() as
          | { host_id: string }
          | undefined,
    );
    const id =
      existing?.host_id ??
      database.transaction((connection) => {
        const fresh = token(12);
        connection
          .prepare(
            'INSERT OR IGNORE INTO device_pairing_host (singleton, host_id, created_at) VALUES (1, ?, ?)',
          )
          .run(fresh, iso(now()));
        return (
          connection
            .prepare('SELECT host_id FROM device_pairing_host WHERE singleton = 1')
            .get() as {
            host_id: string;
          }
        ).host_id;
      });
    return { id, name: options.hostName };
  };

  return {
    host,

    createOffer() {
      sweep();
      while (offers.size >= MAX_OPEN_OFFERS) {
        const first = offers.keys().next().value!;
        const evicted = offers.get(first)!;
        receipts.delete(evicted.receiptId);
        offers.delete(first);
      }
      while (receipts.size >= 64) receipts.delete(receipts.keys().next().value!);
      const offer = token(24);
      const expiresAt = now() + PAIRING_OFFER_TTL_MS;
      const receiptId = token(16);
      const value = { offer, receiptId, expiresAt: iso(expiresAt) };
      offers.set(digest(offer).toString('hex'), value);
      receipts.set(receiptId, { receiptId, status: 'pending', expiresAt: value.expiresAt });
      record({ phase: 'offer-created' });
      return value;
    },

    currentOffer() {
      sweep();
      return [...offers.values()].at(-1);
    },

    offerStatus(receiptId) {
      sweep();
      return { ...(receipts.get(receiptId) ?? { receiptId, status: 'unknown' as const }) };
    },

    redeem(input) {
      const key = digest(input.offer).toString('hex');
      const offered = offers.get(key);
      offers.delete(key);
      if (offered === undefined) {
        record({ phase: 'offer-refused' });
        return { ok: false, code: 'offer-invalid' };
      }
      if (Date.parse(offered.expiresAt) <= now()) {
        receipts.set(offered.receiptId, {
          receiptId: offered.receiptId,
          status: 'expired',
          expiresAt: offered.expiresAt,
        });
        record({ phase: 'offer-expired' });
        return { ok: false, code: 'offer-expired' };
      }
      const id = token(16);
      const secret = token(32);
      const pairedAt = iso(now());
      const name = deviceName(input.name);
      database.transaction(
        (connection) =>
          connection
            .prepare(
              'INSERT INTO paired_devices (device_id, name, secret_hash, paired_at) VALUES (?, ?, ?, ?)',
            )
            .run(id, name, digest(secret).toString('hex'), pairedAt),
        ['paired-devices'],
      );
      receipts.set(offered.receiptId, {
        receiptId: offered.receiptId,
        status: 'redeemed',
        expiresAt: offered.expiresAt,
        deviceId: id,
      });
      record({ phase: 'offer-redeemed', deviceId: id });
      return {
        ok: true,
        device: { id, name, pairedAt },
        credential: `${id}.${secret}`,
        host: host(),
      };
    },

    admit(authorization) {
      const match = CREDENTIAL.exec(authorization?.trim() ?? '');
      if (match === null) {
        record({ phase: 'device-refused', code: 'device-credential-missing' });
        return { ok: false, code: 'device-credential-missing' };
      }
      const deviceId = match[1]!;
      const current = row(deviceId);
      const presented = digest(match[2]!);
      if (
        current === undefined ||
        !timingSafeEqual(presented, Buffer.from(current.secret_hash, 'hex'))
      ) {
        record({ phase: 'device-refused', code: 'device-unknown' });
        return { ok: false, code: 'device-unknown' };
      }
      return active(current);
    },

    check(deviceId) {
      const current = row(deviceId);
      if (current === undefined) {
        record({ phase: 'device-refused', code: 'device-unknown', deviceId });
        return { ok: false, code: 'device-unknown' };
      }
      return active(current);
    },

    list() {
      return (
        database.read((connection) =>
          connection
            .prepare('SELECT * FROM paired_devices ORDER BY paired_at DESC, device_id')
            .all(),
        ) as unknown as Row[]
      ).map(device);
    },

    revoke(deviceId) {
      const changed = database.transaction(
        (connection) =>
          connection
            .prepare(
              'UPDATE paired_devices SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL',
            )
            .run(iso(now()), deviceId).changes,
        ['paired-devices'],
      );
      const open = [...(streams.get(deviceId) ?? [])];
      streams.delete(deviceId);
      for (const close of open) close();
      if (Number(changed) === 0 && open.length === 0) return { revoked: false, closedStreams: 0 };
      record({ phase: 'device-revoked', deviceId, closedStreams: open.length });
      options.onRevoked?.(deviceId);
      return { revoked: true, closedStreams: open.length };
    },

    attachStream(deviceId, close) {
      const open = streams.get(deviceId) ?? new Set();
      open.add(close);
      streams.set(deviceId, open);
      return () => {
        open.delete(close);
        if (open.size === 0 && streams.get(deviceId) === open) streams.delete(deviceId);
      };
    },
  };
}
