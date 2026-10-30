import { isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import { BrowserError, requireValue } from './errors.mjs';

function ipv4Number(ip) {
  return ip.split('.').reduce((n, part) => (n * 256 + Number(part)) >>> 0, 0);
}

function inV4(ip, base, bits) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Number(ip) & mask) === (ipv4Number(base) & mask);
}

function ipv6Value(ip) {
  let input = ip.toLowerCase();
  if (input.includes('.')) {
    const separator = input.lastIndexOf(':');
    const tail = ipv4Number(input.slice(separator + 1));
    input = `${input.slice(0, separator)}:${(tail >>> 16).toString(16)}:${(tail & 0xffff).toString(16)}`;
  }
  const halves = input.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
  const groups = halves.length === 1 ? left : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  return groups.reduce((value, group) => (value << 16n) | BigInt(Number.parseInt(group || '0', 16)), 0n);
}

function inV6(value, prefix, bits) {
  const shift = BigInt(128 - bits);
  return (value >> shift) === (ipv6Value(prefix) >> shift);
}

function canonicalAddress(address) {
  const family = isIP(address);
  if (family === 4) return address.split('.').map(Number).join('.');
  const value = ipv6Value(address);
  const groups = Array.from({ length: 8 }, (_, index) => Number((value >> BigInt((7 - index) * 16)) & 0xffffn));
  let bestStart = -1, bestLength = 1;
  for (let index = 0; index < groups.length;) {
    if (groups[index] !== 0) { index += 1; continue; }
    let end = index;
    while (end < groups.length && groups[end] === 0) end += 1;
    if (end - index > bestLength) { bestStart = index; bestLength = end - index; }
    index = end;
  }
  if (bestStart < 0) return groups.map((group) => group.toString(16)).join(':');
  const left = groups.slice(0, bestStart).map((group) => group.toString(16)).join(':');
  const right = groups.slice(bestStart + bestLength).map((group) => group.toString(16)).join(':');
  return `${left}::${right}`;
}

function isMetadataAddress(address) {
  const family = isIP(address);
  if (family === 4) return ['169.254.169.254', '100.100.100.200'].includes(address);
  return family === 6 && ipv6Value(address) === ipv6Value('fd00:ec2::254');
}

export function classifyAddress(address) {
  const family = isIP(address);
  requireValue(family !== 0, 'invalid-target-address', '代理解析到无效 IP 地址。', 403);
  if (family === 4) {
    const ranges = [
      ['0.0.0.0', 8, 'reserved'], ['10.0.0.0', 8, 'private'], ['100.64.0.0', 10, 'reserved'],
      ['127.0.0.0', 8, 'loopback'], ['169.254.0.0', 16, 'link-local'], ['172.16.0.0', 12, 'private'],
      ['192.0.0.0', 24, 'reserved'], ['192.0.2.0', 24, 'reserved'], ['192.168.0.0', 16, 'private'],
      ['198.18.0.0', 15, 'reserved'], ['198.51.100.0', 24, 'reserved'], ['203.0.113.0', 24, 'reserved'],
      ['224.0.0.0', 4, 'multicast'], ['240.0.0.0', 4, 'reserved'],
    ];
    for (const [base, bits, kind] of ranges) if (inV4(address, base, bits)) return kind;
    if (address === '255.255.255.255') return 'reserved';
    return 'public';
  }
  const value = ipv6Value(address);
  if (inV6(value, '::ffff:0:0', 96)) {
    const ipv4 = Number(value & 0xffffffffn);
    return classifyAddress([24, 16, 8, 0].map((shift) => (ipv4 >>> shift) & 255).join('.'));
  }
  if (value === 0n) return 'reserved';
  if (value === 1n) return 'loopback';
  if (inV6(value, 'fc00::', 7)) return 'private';
  if (inV6(value, 'fe80::', 10)) return 'link-local';
  if (inV6(value, 'ff00::', 8)) return 'multicast';
  // Block IPv4-compatible, NAT64, discard-only, Teredo, 6to4 and documentation/transition prefixes.
  for (const [prefix, bits] of [
    ['::', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
    ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20], ['5f00::', 16],
  ]) if (inV6(value, prefix, bits)) return 'reserved';
  return inV6(value, '2000::', 3) ? 'public' : 'reserved';
}

export function parseTargetRules(raw) {
  let value;
  try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw new BrowserError('invalid-target-rules', '目标规则配置无效。', 500); }
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'invalid-target-rules', '目标规则配置无效。', 500);
  const rules = new Map();
  for (const [origin, rule] of Object.entries(value)) {
    let url;
    try { url = new URL(origin); } catch { throw new BrowserError('invalid-target-rules', '目标 origin 配置无效。', 500); }
    requireValue(
      ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && !url.hostname.endsWith('.') && url.origin === origin,
      'invalid-target-rules', '目标规则必须是规范化的精确 HTTP(S) origin。', 500,
    );
    requireValue(rule && typeof rule === 'object' && Array.isArray(rule.addresses) && rule.addresses.length > 0 && rule.addresses.length <= 8, 'invalid-target-rules', '每个 origin 必须配置 1–8 个静态 IP。', 500);
    const addresses = new Set();
    for (const address of rule.addresses) {
      const kind = classifyAddress(address);
      requireValue(kind === 'public' || (rule.allowPrivate === true && kind === 'private'), 'invalid-target-rules', '目标静态 IP 属于禁止的网络范围。', 500);
      requireValue(!isMetadataAddress(address), 'invalid-target-rules', '云元数据地址不能加入允许列表。', 500);
      addresses.add(canonicalAddress(address));
    }
    rules.set(origin, { addresses, allowPrivate: rule.allowPrivate === true });
  }
  return rules;
}

export function canonicalTarget(input) {
  let url;
  try { url = new URL(input); } catch { throw new BrowserError('invalid-target', '目标 URL 无效。'); }
  requireValue(['http:', 'https:'].includes(url.protocol), 'target-protocol-denied', '只支持 HTTP 或 HTTPS 网页。', 403);
  requireValue(!url.username && !url.password && !url.hostname.endsWith('.'), 'invalid-target', '目标 URL 含有不支持的主机或凭据。', 403);
  return url;
}

export async function authorizeTarget(input, rules, lookup = dnsLookup) {
  const url = canonicalTarget(input);
  const rule = rules.get(url.origin);
  requireValue(rule, 'target-origin-denied', '目标 origin 未获精确授权。', 403);
  const host = url.hostname.replace(/^\[|\]$/gu, '');
  let records;
  try {
    records = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BrowserError('target-dns-denied', '目标 DNS 解析失败。', 403);
  }
  requireValue(Array.isArray(records) && records.length > 0 && records.length <= 16, 'target-dns-denied', '目标 DNS 结果无效。', 403);
  const normalized = records.map((item) => canonicalAddress(item.address));
  for (const address of normalized) {
    const kind = classifyAddress(address);
    requireValue(kind === 'public' || (rule.allowPrivate && kind === 'private'), 'target-address-denied', '目标解析到禁止的网络地址。', 403);
    requireValue(!isMetadataAddress(address), 'target-address-denied', '云元数据地址不能访问。', 403);
    requireValue(rule.addresses.has(address), 'target-address-changed', '目标 DNS 地址与批准的静态 IP 不一致。', 403);
  }
  return { url, address: normalized[0], family: isIP(normalized[0]), rule };
}
