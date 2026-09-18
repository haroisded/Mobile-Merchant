import { Stack } from 'expo-router';

import { useAppTheme } from '../../lib/theme';
import { radius } from '../../themes';

// The systems list is always the bottom of this stack. Without an anchor, a deep link or a web reload
// straight into /systems/<id> builds the stack with that screen alone: back has nowhere to go, and
// "Back to your systems" would push a second list instead of returning to the first. Read by
// expo-router at getRoutesCore.js:655.
export const unstable_settings = { anchor: '(tabs)' };

// Every narrow confirm and inline-create dialog, as a native sheet (instruction_mds/visual-language.md §5).
// Declared here, as leaf routes of this stack, because an Android formSheet cannot host a nested
// stack (react-native-screens types.d.ts:470) — and one set then serves Home, Profile and every stack
// under the shell. The route files are in ./sheets/.
const SHEETS = [
  'sheets/archive-product',
  'sheets/category',
  'sheets/delete-account',
  'sheets/delete-category',
  'sheets/delete-supplier',
  'sheets/delete-tax-class',
  'sheets/remove-system',
  'sheets/supplier',
  'sheets/tax-class',
];

// The root layout declares <Stack.Screen name="(app)" />, and that group needs its own layout to
// render into. This is the seam where further signed-in routes get added without touching the guard.
//
// Children, and the split matters:
// - `(tabs)` owns the merchant-level bottom navigation — the systems list and the Account tab.
// - `systems/[id]` sits outside it, so opening a system PUSHES over the tab bar rather than becoming
//   a fifth tab. It is the merchant shell: a header plus a rail or drawer of its own.
// - `profile` is Profile opened from inside a system. It is pushed over the shell so back returns to
//   the same system; the Account tab cannot do that from here (see profile.tsx).
// - `create-system` is the narrow create wizard, pushed full screen over Home.
// - `sheets/*` are the native sheets above.
export default function AppLayout() {
  const { colors } = useAppTheme();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="systems/[id]" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="create-system" />
      {SHEETS.map((name) => (
        <Stack.Screen
          key={name}
          name={name}
          options={{
            presentation: 'formSheet',
            // Sized to the dialog inside it; Android allows one detent in this mode
            // (BottomSheetBehaviorExt.kt:89).
            sheetAllowedDetents: 'fitToContents',
            // The OS draws the sheet's frame, so its corners are passed from the theme like any
            // other native view (instruction_mds/visual-language.md rule 4).
            sheetCornerRadius: radius.xl,
            contentStyle: { backgroundColor: colors.surface },
          }}
        />
      ))}
    </Stack>
  );
}
