import { useSyncExternalStore, type ReactNode, type ReactElement } from 'react';
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client';
import { APPEARANCE_PRIMARY, type Appearance, type AppearancePatch } from './appearance.js';
import type { PropsLocale, PropsRenderSlots, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { BotModePrefsFace } from './bot-mode-prefs.js';
import { BotIconSetting, MotionSetting } from './bot-mode-setting-rows.js';
import { SettingsRows, SettingsRow } from './ds/settings-row.js';
import { Select } from './ds/select.js';
import { Note } from './ds/note.js';

export interface AppearanceFace extends BotModePrefsFace {
  appearance: Appearance;
  localeSource: Pick<LocaleRuntime, 'getSnapshot' | 'subscribe' | 'setLocale'>;
}

export function AppearanceSection(
  props: PropsLocale<'botharness'> &
    InjectFace<AppearanceFace> &
    PropsRenderSlots<'botharness.settings.layout'>,
): ReactElement {
  const { t, appearance, localeSource, renderSlot } = props;
  const theme = useSyncExternalStore(appearance.subscribe, appearance.getSnapshot);
  const locale = useSyncExternalStore(localeSource.subscribe, localeSource.getSnapshot);
  const change = (patch: AppearancePatch) => {
    try {
      appearance.update(patch);
    } catch {}
  };
  return (
    <SettingsRows>
      <Note>{t('appearance.local')}</Note>
      {theme.error && <Note tone="danger">{t('appearance.saveFailed')}</Note>}
      <SettingsRow
        title={t('settings.theme')}
        control={
          <Select
            label={t('settings.theme')}
            value={theme.config.preference}
            options={[
              { value: 'system', label: t('settings.theme.system') },
              { value: 'light', label: t('settings.theme.light') },
              { value: 'dark', label: t('settings.theme.dark') },
            ]}
            onChange={(preference) => change({ preference })}
          />
        }
      />
      {(['light', 'dark'] as const).map((mode) => (
        <div key={mode}>
          <SettingsRow
            title={t(mode === 'light' ? 'appearance.lightPreset' : 'appearance.darkPreset')}
            control={
              <Select
                label={t(mode === 'light' ? 'appearance.lightPreset' : 'appearance.darkPreset')}
                value={theme.config.modes[mode].preset}
                reselect
                options={[
                  { value: 'classic-blue', label: t('appearance.classicBlue') },
                  { value: 'mist-purple', label: t('appearance.mistPurple') },
                ]}
                onChange={(preset) => change({ mode, preset })}
              />
            }
          />
          <SettingsRow
            title={t(mode === 'light' ? 'appearance.lightPrimary' : 'appearance.darkPrimary')}
            control={
              <input
                type="color"
                aria-label={t(
                  mode === 'light' ? 'appearance.lightPrimary' : 'appearance.darkPrimary',
                )}
                value={
                  theme.config.modes[mode].primary ??
                  APPEARANCE_PRIMARY[theme.config.modes[mode].preset][mode]
                }
                onChange={(event) => change({ mode, primary: event.currentTarget.value })}
              />
            }
          />
        </div>
      ))}
      <MotionSetting {...props} />
      <BotIconSetting {...props} />
      <SettingsRow
        title={t('settings.language')}
        control={
          <Select
            label={t('settings.language')}
            value={locale.active}
            options={locale.locales.map((item) => ({ value: item.id, label: item.label }))}
            onChange={localeSource.setLocale}
          />
        }
      />
      {renderSlot('botharness.settings.layout', {}) as unknown as ReactNode}
    </SettingsRows>
  );
}
