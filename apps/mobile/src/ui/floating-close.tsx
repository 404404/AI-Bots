import { useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
  FLOATING_SIZE,
  initialFloating,
  snapFloating,
  type FloatingBounds,
  type FloatingPoint,
} from './floating-position';
import { t } from './strings';
import { useTheme } from './theme';

let remembered: FloatingPoint | undefined;

export function FloatingClose({ onClose }: { onClose(): void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const bounds: FloatingBounds = {
    width: window.width,
    top: insets.top,
    bottom: window.height - insets.bottom,
  };
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const start = snapFloating(remembered ?? initialFloating(bounds), bounds);
  const position = useRef(new Animated.ValueXY(start)).current;
  const origin = useRef(start);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          Math.abs(gesture.dx) + Math.abs(gesture.dy) > 6,
        onPanResponderGrant: () => {
          position.stopAnimation((value) => {
            origin.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          position.setValue({
            x: origin.current.x + gesture.dx,
            y: origin.current.y + gesture.dy,
          });
        },
        onPanResponderRelease: (_, gesture) => {
          const next = snapFloating(
            { x: origin.current.x + gesture.dx, y: origin.current.y + gesture.dy },
            boundsRef.current,
          );
          remembered = next;
          origin.current = next;
          Animated.spring(position, { toValue: next, useNativeDriver: false }).start();
        },
      }),
    [position],
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: position.getTranslateTransform(),
        width: FLOATING_SIZE,
        height: FLOATING_SIZE,
      }}
    >
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t.closeFullClient}
        accessibilityHint={t.closeFullClientHint}
        style={({ pressed }) => ({
          width: FLOATING_SIZE,
          height: FLOATING_SIZE,
          borderRadius: FLOATING_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
          opacity: pressed ? 1 : 0.88,
          shadowColor: '#000000',
          shadowOpacity: 0.18,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 6,
        })}
      >
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path
            d="M6 6l12 12M18 6L6 18"
            stroke={theme.ink}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        </Svg>
      </Pressable>
    </Animated.View>
  );
}
