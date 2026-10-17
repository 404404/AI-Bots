import { closeSync, openSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { DevicesSnapshot, PairingOfferView } from '../devices/http.js';
import { devicesView, deviceRoutesView, offerStatusView } from '../devices/views.js';
import { CliLiveError } from './cli-live-error.js';
import type { connectLiveHost } from './cli-live.js';

export const PAIRED_DEVICE_COMMANDS = [
  {
    command: 'devices',
    description: 'list paired devices, Host identity and routes without credentials',
  },
  {
    command: 'device-routes',
    description: 'read current phone-route diagnostics without changing networking',
  },
  {
    command: 'device-offer',
    description: 'create a pairing offer; save link only to a new private --out file',
  },
  {
    command: 'device-offer-status',
    description: 'read a safe pairing receipt status, including expiry or settlement',
  },
  {
    command: 'device-revoke',
    description: 'revoke a reviewed device (--expected-device fingerprint, --confirm)',
  },
] as const;
export const PAIRED_DEVICE_OPTIONS = { 'expected-device': { type: 'string' } } as const;
export interface PairedDeviceValues {
  out?: string;
  confirm?: boolean;
  'expected-device'?: string;
}
export type PairedDeviceCommand = (typeof PAIRED_DEVICE_COMMANDS)[number]['command'];
export function isPairedDeviceCommand(command: string): command is PairedDeviceCommand {
  return PAIRED_DEVICE_COMMANDS.some((entry) => entry.command === command);
}
function usage(message: string): never {
  throw new CliLiveError('usage', message);
}
export async function runPairedDeviceCommand(
  command: PairedDeviceCommand,
  rest: string[],
  values: PairedDeviceValues,
  connect: () => Promise<Pick<Awaited<ReturnType<typeof connectLiveHost>>, 'http'>>,
): Promise<unknown> {
  const targeted = command === 'device-offer-status' || command === 'device-revoke';
  if (rest.length !== (targeted ? 1 : 0) || (targeted && !rest[0]?.trim()))
    usage(
      targeted ? `${command} needs exactly one id.` : `${command} takes no positional arguments.`,
    );
  if (
    command === 'device-revoke' &&
    (values.confirm !== true || !/^[a-f0-9]{64}$/u.test(values['expected-device'] ?? ''))
  )
    usage('device-revoke needs the identity from devices in --expected-device and --confirm.');
  if (command === 'device-offer' && (!values.out || !isAbsolute(values.out)))
    usage('device-offer needs an absolute new private --out file. Pairing links never print.');
  if (command === 'device-offer' && process.platform === 'win32')
    throw new CliLiveError(
      'protected-output-unavailable',
      'Use the Human Devices UI until private local-file ACL support is qualified on Windows.',
    );
  if (targeted && !/^[A-Za-z0-9_-]{1,128}$/u.test(rest[0]!))
    usage('Use the exact device or receipt id.');
  let fd: number | undefined;
  try {
    if (command === 'device-offer') {
      try {
        fd = openSync(values.out!, 'wx', 0o600);
      } catch {
        throw new CliLiveError(
          'protected-output-unavailable',
          'Cannot create the private output file; choose a new file in a protected local folder.',
        );
      }
    }
    const host = await connect();
    const json = async <T>(path: string, body?: Record<string, unknown>): Promise<T> => {
      const result = await host.http(path, body);
      try {
        return JSON.parse(Buffer.from(result.bytes).toString('utf8')) as T;
      } catch {
        throw new CliLiveError('host-protocol-error', 'The Host returned invalid device data.');
      }
    };
    if (command === 'devices' || command === 'device-routes') {
      const snapshot = await json<DevicesSnapshot>('/api/botharness/devices');
      return command === 'devices'
        ? devicesView(snapshot)
        : deviceRoutesView(snapshot.host, snapshot.routes);
    }
    if (command === 'device-offer-status')
      return offerStatusView(
        await json(
          '/api/botharness/devices/offer-status?receiptId=' + encodeURIComponent(rest[0]!),
        ),
      );
    if (command === 'device-revoke')
      return json('/api/botharness/devices/revoke', {
        deviceId: rest[0],
        expectedDevice: values['expected-device'],
      });
    const offer = await json<PairingOfferView>('/api/botharness/devices/offer', {});
    try {
      writeFileSync(fd!, JSON.stringify({ link: offer.link, expiresAt: offer.expiresAt }) + '\n');
    } catch {
      throw new CliLiveError(
        'protected-output-failed',
        `Pairing output could not be saved; inspect device-offer-status ${offer.receiptId} before retrying.`,
      );
    }
    return {
      receiptId: offer.receiptId,
      status: 'pending',
      expiresAt: offer.expiresAt,
      reachable: offer.reachable,
      handoff: 'protected-local-file',
    };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
