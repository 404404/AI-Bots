import type { AgentManagementInvocation } from './cli-agent-management.js';
import { isPairedDeviceCommand } from './cli-devices.js';
import { CliLiveError } from './cli-live-error.js';
export const TOB_AGENT_DEVICE_COMMAND_USAGE: Readonly<Record<string, string>> = {
  devices: 'deepseekbot devices; paired devices with reviewed identity fingerprints',
  'device-routes': 'deepseekbot device-routes; current diagnostics only',
  'device-offer':
    'deepseekbot device-offer; create safe receipt, Human opens Settings → Devices → Pair a phone',
  'device-offer-status':
    'deepseekbot device-offer-status <receipt-id>; pending/redeemed/expired/unknown after restart',
  'device-revoke':
    'deepseekbot device-revoke <device-id> --expected-device <observed identity> --confirm',
};
export function parseAgentDevices(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
): AgentManagementInvocation | undefined {
  if (!isPairedDeviceCommand(command)) return undefined;
  const allowed = new Set([
    'compact',
    'help',
    'timeout',
    ...(command === 'device-revoke' ? ['expected-device', 'confirm'] : []),
  ]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'Device credentials and local output are unavailable in scoped CLI.',
    );
  const targeted = command === 'device-revoke' || command === 'device-offer-status';
  if (rest.length !== (targeted ? 1 : 0) || (targeted && !/^[A-Za-z0-9_-]{1,128}$/u.test(rest[0]!)))
    throw new CliLiveError('usage', 'Device command needs the exact documented id.');
  if (
    command === 'device-revoke' &&
    (values.confirm !== true || !/^[a-f0-9]{64}$/u.test(String(values['expected-device'] ?? '')))
  )
    throw new CliLiveError(
      'usage',
      'Revoke needs the observed --expected-device identity and --confirm.',
    );
  return {
    command,
    write: command === 'device-offer' || command === 'device-revoke',
    args:
      command === 'device-revoke'
        ? { deviceId: rest[0], expectedDevice: values['expected-device'], confirm: true }
        : command === 'device-offer-status'
          ? { receiptId: rest[0] }
          : {},
  };
}
