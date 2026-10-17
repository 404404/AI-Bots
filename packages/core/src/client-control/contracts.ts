export interface ClientTarget {
  clientId: string;
  generation: string;
}
export interface ClientControlCommand {
  id: string;
  expiresAt: number;
  operation: string;
  args: Record<string, unknown>;
}
export interface ClientPreferences {
  theme: string;
  locale: string;
  notifications: { enabled: boolean; permission: string };
}
export function isClientTarget(value: unknown): value is ClientTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const target = value as Record<string, unknown>;
  return (
    Object.keys(target).length === 2 &&
    ['clientId', 'generation'].every(
      (key) => typeof target[key] === 'string' && /^[a-zA-Z0-9-]{8,80}$/u.test(target[key]),
    )
  );
}
export function preferenceState(value: ClientPreferences): string {
  return JSON.stringify([
    value.theme,
    value.locale,
    value.notifications.enabled,
    value.notifications.permission,
  ]);
}
export function validateClientPatch(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-input');
  const patch = value as Record<string, unknown>;
  if (Object.keys(patch).length !== 1) throw new Error('one-preference-required');
  for (const [key, item] of Object.entries(patch)) {
    if (key === 'theme' && ['system', 'light', 'dark'].includes(String(item))) continue;
    if (key === 'locale' && typeof item === 'string' && /^[a-zA-Z][a-zA-Z0-9-]{0,30}$/u.test(item))
      continue;
    if (key === 'notifications' && typeof item === 'boolean') continue;
    if (key === 'notificationPermission' && item === 'request') continue;
    throw new Error('unsupported-client-preference');
  }
  return structuredClone(patch);
}
