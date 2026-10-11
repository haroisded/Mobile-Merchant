import { Stack } from 'expo-router';

import { useAppTheme } from '../../../../../lib/theme';

// Stock, a destination of the shell: its own stack, as Setup's is (../setup/_layout.tsx) — the index pushes
// each list, a list pushes an item's page, and Back returns, while the rail stays beside them on a tablet.
// The small forms open from here into src/app/(app)/forms/, outside the shell.
export default function StockLayout() {
  const { colors } = useAppTheme();

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
