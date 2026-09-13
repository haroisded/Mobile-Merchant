import { Stack } from 'expo-router';

// The systems list is always the bottom of this stack. Without an anchor, a deep link or a web reload
// straight into /systems/<id> builds the stack with that screen alone: back has nowhere to go, and
// "Back to your systems" would push a second list instead of returning to the first. Read by
// expo-router at getRoutesCore.js:655.
export const unstable_settings = { anchor: '(tabs)' };

// The root layout declares <Stack.Screen name="(app)" />, and that group needs its own layout to
// render into. This is the seam where further signed-in routes get added without touching the guard.
//
// Three children, and the split matters:
// - `(tabs)` owns the merchant-level bottom navigation — the systems list and the Account tab.
// - `systems/[id]` sits outside it, so opening a system PUSHES over the tab bar rather than becoming
//   a fifth tab. It is the merchant shell: a header plus a rail or drawer of its own.
// - `profile` is Profile opened from inside a system. It is pushed over the shell so back returns to
//   the same system; the Account tab cannot do that from here (see profile.tsx).
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="systems/[id]" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
