import { Stack, useGlobalSearchParams } from 'expo-router';

import { FeaturesProvider } from '../../../screens/features';

// What this person keeps in a store's menu, opened from the store's header: full screen at every width
// (.claude/instruction-mds/frontend.md §4.4). Its own Stack — the list, and a screen's page on a phone — under one
// provider, so the unsaved choices outlive the push between them.
export default function FeaturesLayout() {
  const { merchantId } = useGlobalSearchParams<{ merchantId: string }>();

  return (
    <FeaturesProvider merchantId={merchantId}>
      <Stack screenOptions={{ headerShown: false }} />
    </FeaturesProvider>
  );
}
