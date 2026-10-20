import { showAppDialog } from './primitives/app-dialog';
import { t } from './strings';

export function noticeHostKept(
  result: 'revoked' | 'host-kept' | undefined,
  hostName: string,
): void {
  if (result !== 'host-kept') return;
  showAppDialog(t.unpairHostKept(hostName), t.unpairHostKeptDetail, [{ text: t.done }]);
}
