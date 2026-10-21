import { router, useLocalSearchParams } from 'expo-router';

import { FeaturesForm } from '../../../screens/features';

// What this person keeps in a store's menu — a full page on a phone, a Dialog over the store on a tablet
// (.claude/instruction-mds/frontend.md §4.4; presentation in ../_layout.tsx). Opened from the store's header.
export default function FeaturesPage() {
  const { merchantId } = useLocalSearchParams<{ merchantId: string }>();

  return <FeaturesForm merchantId={merchantId} onDismiss={() => router.back()} />;
}
