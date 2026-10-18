export const APPEARANCE_KEY = 'botharness:appearance:v1';
export type AppearanceMode = 'light' | 'dark';
export type AppearancePreference = AppearanceMode | 'system';
export type AppearancePreset = 'classic-blue' | 'mist-purple';
export const APPEARANCE_PRIMARY = {
  'classic-blue': { light: '#4176e6', dark: '#7aaaff' },
  'mist-purple': { light: '#7957c9', dark: '#b19af0' },
} as const;
export interface AppearanceModeConfig extends Record<string, unknown> {
  preset: AppearancePreset;
  primary?: string;
}
export interface AppearanceConfig extends Record<string, unknown> {
  version: 1;
  revision: string;
  preference: AppearancePreference;
  modes: Record<AppearanceMode, AppearanceModeConfig>;
}
export interface AppearanceSnapshot {
  config: AppearanceConfig;
  mode: AppearanceMode;
  error?: string;
}
export interface AppearanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export class AppearanceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const preset = (value: unknown): value is AppearancePreset =>
  value === 'classic-blue' || value === 'mist-purple';
const preference = (value: unknown): value is AppearancePreference =>
  value === 'system' || value === 'light' || value === 'dark';
export function parseAppearance(raw: string | null): AppearanceConfig {
  if (raw === null)
    return {
      version: 1,
      revision: 'initial',
      preference: 'system',
      modes: {
        light: { preset: 'classic-blue' },
        dark: { preset: 'classic-blue' },
      },
    };
  let v: Record<string, unknown>;
  try {
    v = object(JSON.parse(raw));
  } catch {
    throw new AppearanceError('appearance-storage-invalid');
  }
  if (v.version !== 1 || !preference(v.preference) || typeof v.revision !== 'string')
    throw new AppearanceError('appearance-storage-invalid');
  const modes = object(v.modes);
  for (const mode of ['light', 'dark'] as const) {
    const entry = object(modes[mode]);
    if (
      !preset(entry.preset) ||
      (entry.primary !== undefined &&
        (typeof entry.primary !== 'string' || !/^#[0-9a-f]{6}$/i.test(entry.primary)))
    )
      throw new AppearanceError('appearance-storage-invalid');
  }
  return v as unknown as AppearanceConfig;
}
export interface AppearancePatch {
  preference?: AppearancePreference;
  mode?: AppearanceMode;
  preset?: AppearancePreset;
  primary?: string;
}
export function parseAppearancePatch(value: unknown): AppearancePatch {
  const v = object(value);
  if (
    !Object.keys(v).length ||
    Object.keys(v).some((k) => !['preference', 'mode', 'preset', 'primary'].includes(k)) ||
    (v.preference !== undefined && !preference(v.preference)) ||
    (v.mode !== undefined && v.mode !== 'light' && v.mode !== 'dark') ||
    (v.preset !== undefined && !preset(v.preset)) ||
    (v.primary !== undefined &&
      (typeof v.primary !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.primary))) ||
    ((v.preset !== undefined || v.primary !== undefined) && v.mode === undefined) ||
    (v.mode !== undefined && v.preset === undefined && v.primary === undefined)
  )
    throw new AppearanceError('appearance-invalid-input');
  return v as AppearancePatch;
}
export class Appearance {
  #snapshot: AppearanceSnapshot;
  #listeners = new Set<() => void>();
  constructor(
    private storage: AppearanceStorage | undefined,
    private system: () => AppearanceMode,
    private revision: () => string = () => crypto.randomUUID(),
  ) {
    this.#snapshot = { config: parseAppearance(null), mode: system() };
    this.refresh();
  }
  getSnapshot = (): AppearanceSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  #read(): AppearanceConfig {
    if (!this.storage) throw new AppearanceError('appearance-storage-unavailable');
    try {
      return parseAppearance(this.storage.getItem(APPEARANCE_KEY));
    } catch (error) {
      throw error instanceof AppearanceError
        ? error
        : new AppearanceError('appearance-storage-unavailable');
    }
  }
  #publish(config: AppearanceConfig, error?: string): void {
    this.#snapshot = {
      config,
      mode: config.preference === 'system' ? this.system() : config.preference,
      ...(error ? { error } : {}),
    };
    for (const listener of this.#listeners) listener();
  }
  refresh = (): void => {
    try {
      this.#publish(this.#read());
    } catch (error) {
      this.#publish(this.#snapshot.config, (error as AppearanceError).code);
    }
  };
  update = (value: unknown, expectedRevision?: string): AppearanceSnapshot => {
    try {
      const patch = parseAppearancePatch(value);
      const current = this.#read();
      if (expectedRevision !== undefined && expectedRevision !== current.revision)
        throw new AppearanceError('appearance-revision-conflict');
      const next = structuredClone(current);
      next.revision = this.revision();
      if (patch.preference !== undefined) next.preference = patch.preference;
      if (patch.mode !== undefined) {
        const mode = next.modes[patch.mode];
        if (patch.preset !== undefined) {
          mode.preset = patch.preset;
          delete mode.primary;
        }
        if (patch.primary !== undefined) mode.primary = patch.primary.toLowerCase();
      }
      try {
        this.storage!.setItem(APPEARANCE_KEY, JSON.stringify(next));
      } catch {
        throw new AppearanceError('appearance-storage-unavailable');
      }
      this.#publish(next);
      return this.#snapshot;
    } catch (error) {
      this.#publish(this.#snapshot.config, (error as AppearanceError).code);
      throw error;
    }
  };
}
