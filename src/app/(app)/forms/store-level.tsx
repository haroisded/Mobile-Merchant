import { router, useLocalSearchParams } from 'expo-router';

import { StoreLevelForm } from '../../../screens/features/store-level-form';

// The owner changes a store's level — a full page on a phone, a Dialog over Features on a tablet
// (.claude/instruction-mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function StoreLevelPage() {
  const { merchantId } = useLocalSearchParams<{ merchantId: string }>();

  return <StoreLevelForm merchantId={merchantId} onDismiss={() => router.back()} />;
}
