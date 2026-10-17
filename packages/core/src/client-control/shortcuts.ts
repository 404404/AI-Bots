export interface ClientShortcutBinding {
  code: string;
  secondCode?: string;
  modifiers: ('primary' | 'control' | 'alt' | 'shift' | 'meta')[];
}
export type ClientShortcutEdit = {
  profile: string;
  id: string;
} & ({ type: 'set'; binding: ClientShortcutBinding } | { type: 'disable' | 'reset' });
export function validateShortcutEdit(value: unknown): ClientShortcutEdit {
  const invalid = (): never => { throw new Error('invalid-shortcut-edit'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,240}$/u.test(v.id) || typeof v.profile !== 'string' || !/^(web|desktop):(macos|windows|linux)$/u.test(v.profile)) return invalid();
  const fields = ['profile', 'id', 'type', ...(v.type === 'set' ? ['binding'] : [])];
  if (!['set', 'disable', 'reset'].includes(String(v.type)) || Object.keys(v).length !== fields.length || fields.some(key => !Object.hasOwn(v, key))) return invalid();
  if (v.type === 'set') {
    if (!v.binding || typeof v.binding !== 'object' || Array.isArray(v.binding)) return invalid();
    const binding = v.binding as Record<string, unknown>;
    const code = (value: unknown) => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]{0,39}$/u.test(value);
    if (!code(binding.code) || (binding.secondCode !== undefined && (!code(binding.secondCode) || binding.secondCode === binding.code)) || !Array.isArray(binding.modifiers) || binding.modifiers.some(mod => !['primary', 'control', 'alt', 'shift', 'meta'].includes(String(mod))) || new Set(binding.modifiers).size !== binding.modifiers.length || Object.keys(binding).some(key => !['code', 'secondCode', 'modifiers'].includes(key))) return invalid();
  }
  return structuredClone(value) as ClientShortcutEdit;
}
