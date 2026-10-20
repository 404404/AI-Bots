import type { ApprovalRequest } from '../host/requests';
import { t } from './strings';

export function alwaysNote(request: Pick<ApprovalRequest, 'toolName' | 'allowAlways'>): string {
  if (!request.allowAlways) return t.alwaysUnavailable;
  if (request.toolName === 'secret_cli') return t.alwaysKindScope;
  if (request.toolName === 'secret_mcp_connect') return t.alwaysServiceScope;
  return t.alwaysToolScope(request.toolName);
}
