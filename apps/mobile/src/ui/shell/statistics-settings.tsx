import { useState, useSyncExternalStore } from 'react';
import { mobileTelemetry } from '../../telemetry/native';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Toggle } from '../primitives/toggle';
import { t } from '../strings';

export function StatisticsSettings() {
  const state = useSyncExternalStore(mobileTelemetry.subscribe, mobileTelemetry.getSnapshot);
  const [saving, setSaving] = useState(false);
  return (
    <SettingsSection
      footer={
        state.storageError
          ? `${t.statisticsStorageError} ${t.statisticsNotice}`
          : t.statisticsNotice
      }
    >
      <SettingsRow
        title={t.statisticsTitle}
        trailing={
          <Toggle
            label={t.statisticsTitle}
            value={state.enabled}
            disabled={!state.loaded || saving}
            onChange={(value) => {
              setSaving(true);
              void mobileTelemetry.setEnabled(value).finally(() => setSaving(false));
            }}
          />
        }
      />
    </SettingsSection>
  );
}
