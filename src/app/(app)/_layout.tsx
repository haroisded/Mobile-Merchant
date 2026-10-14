import { Stack } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { ShellWideContext, WIDE_MIN } from '../../lib/columns';
import { useAppTheme } from '../../lib/theme';
import { radius } from '../../themes';

// The systems list is always the bottom of this stack. Without an anchor, a deep link straight into
// /systems/<id> builds the stack with that screen alone: back has nowhere to go, and
// "Back to your systems" would push a second list instead of returning to the first. Read by
// expo-router at getRoutesCore.js:655.
export const unstable_settings = { anchor: '(tabs)' };

// Every narrow confirm and picker, as a native sheet (.claude/instruction_mds/frontend.md §5). Declared
// here, as leaf routes of this stack, because an Android formSheet cannot host a nested stack
// (react-native-screens types.d.ts:470). The route files are in ./sheets/.
//
// This list must name every file in ./sheets/, and nothing else. Both halves fail silently: a name
// with no file is ignored, and a file with no name here still routes — as an ordinary full-screen
// push with no sheet presentation and no contentStyle, which is how delete-product shipped as a
// top-aligned white screen (a tester's report, 2026-09-19 — commit 5076055).
const SHEETS = ['sheets/confirm', 'sheets/delete-account', 'sheets/delete-fiscal-year', 'sheets/pick', 'sheets/remove-system'];

// The small forms, Setup's and Access Codes': full pages on a phone, a Dialog over the list they were opened
// from on a tablet (.claude/instruction_mds/frontend.md §4.4). Wide they are transparentModals, so that list
// stays mounted and shows under the backdrop; the Dialog itself is drawn by AdaptiveDialog `asPage`. The route
// files are in ./forms/, and the same both-halves rule as SHEETS holds.
const DIALOG_ROUTES = [
  'forms/fiscal-year',
  'forms/role',
  'forms/role-profile',
  'forms/user',
  'forms/user-permission',
  'forms/account',
  'forms/cost-center',
  'forms/mode-of-payment',
  'forms/tax-category',
  'forms/item-tax-template',
  'forms/warehouse',
  'forms/uom',
  'forms/uom-conversion-factor',
  'forms/price-list',
  'forms/brand',
  'forms/tax-rule',
  'forms/tax-rule-check',
  'forms/naming-series',
  'forms/series-counter',
  'forms/letter-head',
  'forms/item-price',
  'forms/ledger-filters',
  'forms/new-access-code',
  'forms/access-code',
  'forms/access-request',
  'forms/enter-access-code',
];

// The root layout declares <Stack.Screen name="(app)" />, and that group needs its own layout to
// render into. This is the seam where further signed-in routes get added without touching the guard.
//
// Children, and the split matters:
// - `(tabs)` owns the merchant-level bottom navigation — the systems list and the Account tab.
// - `systems/[id]` sits outside it, so opening a system PUSHES over the tab bar rather than becoming
//   a fifth tab. It is the merchant shell: a header plus a rail or drawer of its own.
// - `create-system` is the create form, pushed full screen over the systems list at every width.
// - `forms/*` are the small Setup forms above; `sheets/*` are the native sheets above.
export default function AppLayout() {
  const { colors } = useAppTheme();
  // The one wide/narrow decision (.claude/instruction_mds/frontend.md §4.1). The window, not a container:
  // synchronous, so no zero-width first frame, and it follows rotation and split-screen. Read here
  // rather than in the shell because (tabs) and sheets/ sit beside the shell, not under it.
  const wide = useWindowDimensions().width >= WIDE_MIN;

  return (
    <ShellWideContext value={wide}>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="systems/[id]" />
      <Stack.Screen name="create-system" />
      {DIALOG_ROUTES.map((name) => (
        <Stack.Screen
          key={name}
          name={name}
          options={
            wide ? { presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } } : undefined
          }
        />
      ))}
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
            // other native view (.claude/instruction_mds/frontend.md rule 7).
            sheetCornerRadius: radius.xl,
            contentStyle: { backgroundColor: colors.surface },
          }}
        />
      ))}
    </Stack>
    </ShellWideContext>
  );
}
