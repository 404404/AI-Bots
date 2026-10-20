import { useState } from 'react';
import { Linking, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { t } from '../strings';

export function PairingGuide() {
  const theme = useDesignTheme();
  const [linkError, setLinkError] = useState(false);
  const open = () => {
    setLinkError(false);
    void Linking.openURL(t.pairGuide.url).catch(() => setLinkError(true));
  };
  return (
    <View
      style={{
        gap: space.x3,
        padding: space.x5,
        borderRadius: radius.lg,
        backgroundColor: theme.layer.raised.fill,
      }}
    >
      <Text strong accessibilityRole="header">
        {t.pairGuide.title}
      </Text>
      {t.pairGuide.steps.map((step, index) => (
        <View key={step} style={{ flexDirection: 'row', gap: space.x2 }}>
          <Text tone="muted" strong>{`${index + 1}.`}</Text>
          <Text tone="muted" style={{ flex: 1 }}>
            {step}
          </Text>
        </View>
      ))}
      <Button testID="pair-guide-open" label={t.pairGuide.open} variant="text" onPress={open} />
      {linkError ? (
        <Text accessibilityRole="alert" tone="danger">
          {t.pairGuide.linkError}
        </Text>
      ) : null}
    </View>
  );
}
