export const TOB_DEVICE_SETTINGS_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'botharness-browser': ['target', 'localDriver', 'containerDriver'],
  'botharness-computer': ['target', 'idleStopMinutes', 'exportDir', 'autoAllowActions'],
};

export function validDeviceSetting(namespace: string, field: string, value: unknown): boolean {
  if (!TOB_DEVICE_SETTINGS_FIELDS[namespace]?.includes(field)) return false;
  if (field === 'target')
    return (
      typeof value === 'string' &&
      (namespace === 'botharness-browser'
        ? ['local', 'container', 'extension', 'daily-control', 'profile-control']
        : ['local', 'container']
      ).includes(value)
    );
  if (field === 'localDriver' || field === 'containerDriver')
    return typeof value === 'string' && ['current', 'agent-browser'].includes(value);
  if (field === 'autoAllowActions') return typeof value === 'boolean';
  if (field === 'idleStopMinutes')
    return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 1440;
  return (
    typeof value === 'string' &&
    value.length <= 4096 &&
    !/[\u0000-\u001f\u007f]/u.test(value) &&
    (value === '' || value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value))
  );
}
