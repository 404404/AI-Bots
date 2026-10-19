import type { PairingFailure } from '../host/pairing';
import type { PairingMethod } from '../telemetry/schema';
import { t } from './strings';

const LINK_FAULTS = new Set<PairingFailure>([
  'link-invalid',
  'link-expired',
  'offer-invalid',
  'offer-expired',
]);

/** What a refused pairing says: a pasted or opened link is talked about as a link, a scan as a code. */
export function pairingFailureText(code: PairingFailure, method: PairingMethod): string {
  if (method === 'qr') return t.pairRefused[code];
  const link: Partial<Record<PairingFailure, string>> = t.pairRefusedLink;
  return link[code] ?? t.pairRefused[code];
}

/** A pasted link that can never pair is cleared, so the next paste starts from an empty field. */
export function clearsPastedLink(code: PairingFailure, method: PairingMethod): boolean {
  return method === 'paste' && LINK_FAULTS.has(code);
}
