import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useRef } from "react";
import { FlatList, Pressable, View } from "react-native";

import { useDesignTheme } from "../../src/ui/design/theme";
import { radius, space } from "../../src/ui/design/tokens";
import { Text } from "../../src/ui/primitives/text";

type Direction = "normal" | "inverted";
type HeaderFill = "undefined" | "clear";

const LINES = [
  "Short one.",
  "A longer reply that wraps onto a second line so the bubble has some height to it.",
  "Scroll me under the header and watch the top edge.",
  "Three\nshort\nlines.",
  "The question is whether the whole list goes darker once the header is transparent.",
];

const MESSAGES = Array.from({ length: 40 }, (_, index) => ({
  key: String(index),
  mine: index % 3 === 1,
  text: `${String(index + 1)}. ${LINES[index % LINES.length] ?? ""}`,
}));

export default function HeaderProbe() {
  const theme = useDesignTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ list?: string; fill?: string }>();
  const direction: Direction =
    params.list === "inverted" ? "inverted" : "normal";
  const fill: HeaderFill = params.fill === "clear" ? "clear" : "undefined";
  const list = useRef<FlatList<(typeof MESSAGES)[number]>>(null);
  const settled = useRef(false);
  const inverted = direction === "inverted";
  const data = inverted ? [...MESSAGES].reverse() : MESSAGES;

  const option = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        paddingHorizontal: space.x4,
        paddingVertical: space.x2,
        borderRadius: radius.round,
        backgroundColor: active ? theme.color.accent : theme.color.surface,
      }}
    >
      <Text
        variant="meta"
        style={{ color: active ? theme.color.onAccent : theme.color.fg }}
      >
        {label}
      </Text>
    </Pressable>
  );

  const controls = (
    <View style={{ gap: space.x3, padding: space.x4 }}>
      <View style={{ flexDirection: "row", gap: space.x3 }}>
        {option("Normal list", !inverted, () => {
          settled.current = false;
          router.setParams({ list: "normal" });
        })}
        {option("Inverted list", inverted, () => {
          settled.current = false;
          router.setParams({ list: "inverted" });
        })}
      </View>
      <View style={{ flexDirection: "row", gap: space.x3 }}>
        {option("Header bg undefined", fill === "undefined", () =>
          router.setParams({ fill: "undefined" }),
        )}
        {option("Header bg clear", fill === "clear", () =>
          router.setParams({ fill: "clear" }),
        )}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Header probe",
          headerShown: true,
          headerTransparent: true,
          headerLargeTitle: false,
          headerStyle:
            fill === "clear" ? { backgroundColor: "transparent" } : {},
          scrollEdgeEffects: {
            top: "automatic",
            bottom: "hidden",
            left: "hidden",
            right: "hidden",
          },
          contentStyle: { backgroundColor: theme.color.base },
        }}
      />
      <FlatList
        key={direction}
        ref={list}
        inverted={inverted}
        data={data}
        keyExtractor={(item) => item.key}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustsScrollIndicatorInsets
        style={{ flex: 1, backgroundColor: theme.color.base }}
        contentContainerStyle={{ paddingVertical: space.x3, gap: space.x2 }}
        onContentSizeChange={() => {
          if (inverted || settled.current) return;
          settled.current = true;
          list.current?.scrollToEnd({ animated: false });
        }}
        {...(inverted
          ? { ListFooterComponent: controls }
          : { ListHeaderComponent: controls })}
        renderItem={({ item }) => (
          <View
            style={{
              alignSelf: item.mine ? "flex-end" : "flex-start",
              maxWidth: "80%",
              marginHorizontal: space.x4,
              paddingHorizontal: space.x4,
              paddingVertical: space.x3,
              borderRadius: radius.lg,
              backgroundColor: item.mine
                ? theme.color.accent
                : theme.color.surface,
            }}
          >
            <Text
              style={{
                color: item.mine ? theme.color.onAccent : theme.color.fg,
              }}
            >
              {item.text}
            </Text>
          </View>
        )}
      />
    </>
  );
}
