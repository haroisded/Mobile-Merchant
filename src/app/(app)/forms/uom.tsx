import { router, useLocalSearchParams } from 'expo-router';

import { UomForm } from '../../../screens/uoms/uom-form';

// Create or edit a unit — a full page on a phone, a Dialog over UOMs on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function UomPage() {
  const { merchantId, uomId } = useLocalSearchParams<{ merchantId: string; uomId?: string }>();

  return <UomForm merchantId={merchantId} uomId={uomId} onDismiss={() => router.back()} />;
}
