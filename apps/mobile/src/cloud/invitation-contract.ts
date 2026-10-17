import { ClientError } from './instance-contract';
export type Invitation = {
  invitationId: string;
  organizationId: string;
  organizationName?: string | undefined;
  email: string;
  role: 'member';
  state: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
};
export type PendingInvitation = {
  organizationId: string;
  userId: string;
  email: string;
  operation: string;
};
export const validInvitationId = (value: unknown): value is string =>
  typeof value === 'string' && /^invitation_[A-Za-z0-9]+$/.test(value);
export function parseInvitation(value: unknown): Invitation {
  const v = value as Invitation;
  if (
    !v ||
    !validInvitationId(v.invitationId) ||
    !/^org_[A-Za-z0-9]+$/.test(v.organizationId) ||
    typeof v.email !== 'string' ||
    v.role !== 'member' ||
    !['pending', 'accepted', 'revoked', 'expired'].includes(v.state) ||
    !Number.isFinite(Date.parse(v.expiresAt)) ||
    (v.organizationName !== undefined && typeof v.organizationName !== 'string')
  )
    throw new ClientError('INVALID_RESPONSE');
  return {
    invitationId: v.invitationId,
    organizationId: v.organizationId,
    organizationName: v.organizationName,
    email: v.email,
    role: v.role,
    state: v.state,
    expiresAt: v.expiresAt,
  };
}
export function parsePendingInvitation(value: unknown): PendingInvitation | undefined {
  if (value === undefined) return;
  const v = value as PendingInvitation;
  if (
    !v ||
    !/^org_[A-Za-z0-9]+$/.test(v.organizationId) ||
    !/^user_[A-Za-z0-9]+$/.test(v.userId) ||
    typeof v.email !== 'string' ||
    v.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) ||
    !/^[A-Za-z0-9_-]{16,100}$/.test(v.operation)
  )
    throw new ClientError('INVALID_LOCAL_STATE');
  return {
    organizationId: v.organizationId,
    userId: v.userId,
    email: v.email,
    operation: v.operation,
  };
}
