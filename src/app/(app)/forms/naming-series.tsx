import { router, useLocalSearchParams } from 'expo-router';

import { NamingSeriesForm } from '../../../screens/document-naming-settings/naming-series-form';

// One document's naming series — a full page on a phone, a Dialog over Document Naming Settings on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function NamingSeriesPage() {
  const { merchantId, documentType } = useLocalSearchParams<{ merchantId: string; documentType: string }>();

  return <NamingSeriesForm merchantId={merchantId} documentType={documentType} onDismiss={() => router.back()} />;
}
