import { isIP } from 'node:net';
import { requireValue } from './errors.ts';

type Ip = { version: 4 | 6; value: bigint };

function parseV4(value: string): bigint | undefined {
  if (isIP(value) !== 4) return undefined;
  const octets = value.split('.').map(Number);
  return octets.reduce((result, octet) => (result << 8n) | BigInt(octet), 0n);
}

function parseV6(value: string): bigint | undefined {
  if (isIP(value) !== 6 || value.includes('%')) return undefined;
  let input = value.toLowerCase();
  const dot = input.lastIndexOf('.');
  if (dot !== -1) {
    const colon = input.lastIndexOf(':');
    if (colon === -1) return undefined;
    const v4 = parseV4(input.slice(colon + 1));
    if (v4 === undefined) return undefined;
    const high = Number((v4 >> 16n) & 0xffffn).toString(16);
    const low = Number(v4 & 0xffffn).toString(16);
    input = `${input.slice(0, colon)}:${high}:${low}`;
  }
  const separator = input.indexOf('::');
  const hasCompression = separator !== -1;
  if (hasCompression && input.indexOf('::', separator + 2) !== -1) return undefined;
  const sides = hasCompression
    ? [input.slice(0, separator), input.slice(separator + 2)]
    : [input];
  const groups = sides.flatMap((side) => (side ? side.split(':') : []));
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) return undefined;
  if (hasCompression ? groups.length >= 8 : groups.length !== 8) return undefined;
  const all = hasCompression
    ? [...(sides[0] ? sides[0].split(':') : []), ...Array(8 - groups.length).fill('0'), ...(sides[1] ? sides[1].split(':') : [])]
    : groups;
  if (all.length !== 8) return undefined;
  return all.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
}

export function normalizeIpAddress(address: string): Ip | undefined {
  const v4 = parseV4(address);
  if (v4 !== undefined) return { version: 4, value: v4 };
  const v6 = parseV6(address);
  if (v6 === undefined) return undefined;
  if ((v6 >> 32n) === 0xffffn) return { version: 4, value: v6 & 0xffffffffn };
  return { version: 6, value: v6 };
}

function inCidr(ip: Ip, version: 4 | 6, network: bigint, prefix: number): boolean {
  if (ip.version !== version) return false;
  const width = version === 4 ? 32 : 128;
  return (ip.value >> BigInt(width - prefix)) === (network >> BigInt(width - prefix));
}

const V4_NETWORKS: Array<[bigint, number]> = [
  [0x0a000000n, 8], // RFC1918 10/8
  [0xac100000n, 12], // RFC1918 172.16/12
  [0xc0a80000n, 16], // RFC1918 192.168/16
  [0x64400000n, 10], // RFC6598 shared address space
  [0x7f000000n, 8], // loopback
];
const V6_NETWORKS: Array<[bigint, number]> = [
  [0xfc000000000000000000000000000000n, 7], // RFC4193 ULA
  [1n, 128], // loopback
];

export function isPrivateOrLoopbackAddress(address: string): boolean {
  const ip = normalizeIpAddress(address);
  if (!ip) return false;
  if (ip.version === 4) return V4_NETWORKS.some(([network, prefix]) => inCidr(ip, 4, network, prefix));
  return V6_NETWORKS.some(([network, prefix]) => inCidr(ip, 6, network, prefix));
}

export type NetworkAccessPolicy = Readonly<{
  hosts: ReadonlySet<string>;
  origins: ReadonlySet<string>;
}>;

function canonicalUrl(value: unknown): URL {
  requireValue(
    typeof value === 'string' &&
      value.length <= 512 &&
      value === value.trim() &&
      !/[\u0000-\u0020\u007f]/u.test(value),
    'invalid-trusted-url',
    '受信地址配置无效。',
  );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    requireValue(false, 'invalid-trusted-url', '受信地址配置无效。');
    throw new Error('unreachable');
  }
  requireValue(
    ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.hostname.includes('*') &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash,
    'invalid-trusted-url',
    '受信地址配置无效。',
  );
  return url;
}

export function createNetworkAccessPolicy(
  publicUrl: string,
  trustedUrls: readonly string[] = [],
  listeningPort?: number,
): NetworkAccessPolicy {
  const primary = canonicalUrl(publicUrl);
  const urls = [primary, ...trustedUrls.map(canonicalUrl)];
  const hosts = new Set(urls.map((url) => url.host.toLowerCase()));
  const origins = new Set(urls.map((url) => url.origin.toLowerCase()));
  const ports = new Set<number>([Number(primary.port || (primary.protocol === 'https:' ? 443 : 80))]);
  if (listeningPort !== undefined) ports.add(listeningPort);
  for (const port of ports) {
    hosts.add(`127.0.0.1:${port}`);
    hosts.add(`localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
    origins.add(`http://localhost:${port}`);
  }
  return { hosts, origins };
}

export function trustedHost(host: string | undefined, policy: NetworkAccessPolicy): boolean {
  if (!host || host.length > 512 || /[\s/@?#]/u.test(host)) return false;
  try {
    const parsed = new URL(`http://${host}`);
    return parsed.pathname === '/' && !parsed.username && !parsed.password && policy.hosts.has(parsed.host.toLowerCase());
  } catch {
    return false;
  }
}

export function trustedOrigin(origin: string | undefined, policy: NetworkAccessPolicy): boolean {
  if (!origin || origin.length > 512) return false;
  try {
    const parsed = new URL(origin);
    return parsed.origin !== 'null' && parsed.origin === origin.toLowerCase() && policy.origins.has(parsed.origin.toLowerCase());
  } catch {
    return false;
  }
}

export function configuredTrustedUrls(value: string | undefined): string[] {
  if (value === undefined || value === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    requireValue(false, 'invalid-trusted-url-config', '受信地址配置无效。');
    return [];
  }
  requireValue(
    Array.isArray(parsed) && parsed.length <= 32 && parsed.every((item) => typeof item === 'string'),
    'invalid-trusted-url-config',
    '受信地址配置无效。',
  );
  return parsed as string[];
}
