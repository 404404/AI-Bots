import { Stack } from 'expo-router';
import { SheetStack } from '../../../src/ui/primitives/sheet-stack';

export default function BotProfileLayout() {
  return (
    <SheetStack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="memory" />
      <Stack.Screen name="activity" />
      <Stack.Screen name="routine" />
      <Stack.Screen name="routine-edit" />
      <Stack.Screen name="model" />
      <Stack.Screen name="workspace" />
    </SheetStack>
  );
}
