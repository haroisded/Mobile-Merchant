import { Stack, useGlobalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useAppTheme } from '../../../../../lib/theme';
import { FeaturesProvider } from '../../../../../screens/features';

// Features, the shell's last destination: what this person keeps in the store's menu. Its own stack — the list, and a
// screen's page on a phone — under one provider, so the unsaved choices outlive the push between them, while the rail
// stays beside them on a tablet.
export default function FeaturesLayout() {
  const { colors } = useAppTheme();
  const { id } = useGlobalSearchParams<{ id: string }>();
  // The store it opened in, kept: the global params follow the focused route, and a sheet over the shell (About, the
  // discard ask) has no id — read live, the page went back to its spinner and the unsaved choices were lost.
  const [merchantId] = useState(id);

  return (
    <FeaturesProvider merchantId={merchantId}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
    </FeaturesProvider>
  );
}
