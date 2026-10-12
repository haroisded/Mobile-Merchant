import { Stack } from 'expo-router';

import { useAppTheme } from '../../../../../lib/theme';

// Sell, a destination of the shell: its own stack, as Stock's is (../stock/_layout.tsx) — the index pushes the
// Register, the Register its cart, a sale its receipt, and Back returns, while the rail stays beside them on
// a tablet.
export default function SellLayout() {
  const { colors } = useAppTheme();

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
