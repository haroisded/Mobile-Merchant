import { router, useLocalSearchParams } from 'expo-router';

import { SeriesCounterForm } from '../../../screens/document-naming-settings/series-counter-form';

// Update Series — a full page on a phone, a Dialog over Document Naming Settings on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function SeriesCounterPage() {
  const { merchantId } = useLocalSearchParams<{ merchantId: string }>();

  return <SeriesCounterForm merchantId={merchantId} onDismiss={() => router.back()} />;
}
