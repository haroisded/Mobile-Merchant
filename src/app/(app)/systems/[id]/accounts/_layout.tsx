import { Stack } from 'expo-router';

import { useAppTheme } from '../../../../../lib/theme';

// Accounts, a destination of the shell: its own stack, as Stock's and Setup's are (../stock/_layout.tsx) —
// the index pushes the General Ledger, a row pushes its document, and Back returns, while the rail stays
// beside them on a tablet. The Filters panel opens from here into src/app/(app)/forms/, outside the shell.
export default function AccountsLayout() {
  const { colors } = useAppTheme();

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
