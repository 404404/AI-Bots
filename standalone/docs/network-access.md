# Standalone Bot network access

The candidate server checks the TCP peer address and the HTTP `Host` and `Origin` headers before dispatching a request. It reads the peer address from `req.socket.remoteAddress`; forwarding headers such as `X-Forwarded-For` do not grant access.

Allowed source ranges are fixed in `src/network-access.ts`: RFC1918 IPv4 (`10/8`, `172.16/12`, `192.168/16`), RFC6598 shared space (`100.64/10`), IPv4 loopback (`127/8`), IPv6 ULA (`fc00::/7`) and IPv6 loopback (`::1/128`). CIDR membership is checked numerically. IPv4-mapped IPv6 addresses are normalized before classification. Other public addresses, unspecified/malformed addresses and IPv6 transition prefixes are denied.

`BOT_PUBLIC_URL` is the primary exact browser URL. `BOT_TRUSTED_URLS` is an optional JSON array of additional exact `http` or `https` origin URLs, for example:

```yaml
environment:
  BOT_PUBLIC_URL: http://192.168.68.11:20443
  BOT_TRUSTED_URLS: '["http://192.168.68.12:20443","http://192.168.110.11:20443","http://10.250.250.1:20443"]'
```

The aliases authorize only their exact normalized host and origin, including port and scheme. Wildcards, paths, credentials, whitespace, query strings and fragments are rejected. The trusted list is deployment configuration; HTTP/model parameters cannot change it. Loopback URLs remain available for local health checks and CLI access.

The candidate Compose file publishes port 20443 on `0.0.0.0` so configured host interfaces, including the EasyTier address, can reach the listener. The application still rejects non-private source addresses and unlisted `Host`/`Origin` values. Because the socket bind itself is broad, this application check does not replace a host firewall or prove that public networks cannot reach the TCP port; deployments on a host with public routing must maintain an independent firewall boundary. The browser worker control socket is not published by this Compose service.

Login remains required for business APIs. Session cookies remain `HttpOnly` and `SameSite=Strict`; request `Origin` and `Sec-Fetch-Site` checks remain enabled for mutations. This slice does not add wildcard CORS or trust proxy headers.

## Historical GK50 host guard

GK50 also had a dedicated nftables `inet gk50_bots_lan` input rule allowing only `192.168.68.0/24` to the LAN destination on TCP 20443. It can reject requests before the application receives them, even when `iptables -S INPUT` reports ACCEPT. On 2026-10-31 that one rule and its `/etc/gk50-bots-lan.nft` persistence file were aligned with the authorized IPv4 private/shared/loopback ranges. Other rules and services were not changed; the legacy socket proxy remains inactive.

The [scoped sample](../deploy/gk50-intranet.nft) is for that existing historical guard only. It is not a general firewall installation script. Back up and inspect the exact table and persistence file, validate syntax, then replace the matching live rule once. It uses five conjunctive exclusions because this host's nft crashes when checking a replacement using an anonymous interval set. The [deployment record](../../docs/acceptance/standalone-employee-deployment-2026-10-30.md) distinguishes this external configuration from the unchanged candidate image and records the failure and verification.
