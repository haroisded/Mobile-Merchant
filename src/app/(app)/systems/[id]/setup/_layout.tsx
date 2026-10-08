import { Stack } from 'expo-router';

import { useAppTheme } from '../../../../../lib/theme';

// Setup, the shell's second destination: its own stack, so the index pushes each master and Back returns
// to the index, while the rail stays beside them on a tablet. The small forms open from here into
// src/app/(app)/forms/, outside the shell (a page on a phone, a Dialog on a tablet).
export default function SetupLayout() {
  const { colors } = useAppTheme();

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
