import { Stack } from 'expo-router';

// The root layout declares <Stack.Screen name="(app)" />, and that group needs its own layout to
// render into. This is the seam where further signed-in routes get added without touching the guard.
//
// Two children, and the split matters: `(tabs)` owns the bottom navigation, while `systems/[id]`
// sits outside it so opening a system PUSHES over the tab bar rather than becoming a fifth tab.
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="systems/[id]" />
    </Stack>
  );
}
