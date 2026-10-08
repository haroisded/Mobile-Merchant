import { router, useLocalSearchParams } from 'expo-router';

import { CostCenterForm } from '../../../screens/cost-centers/cost-center-form';

// Add or edit a cost center — a full page on a phone, a Dialog over Cost Centers on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function CostCenterPage() {
  const { merchantId, costCenterId, parentId } = useLocalSearchParams<{ merchantId: string; costCenterId?: string; parentId?: string }>();

  return <CostCenterForm merchantId={merchantId} costCenterId={costCenterId} parentId={parentId} onDismiss={() => router.back()} />;
}
