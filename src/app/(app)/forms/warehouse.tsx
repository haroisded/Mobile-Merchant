import { router, useLocalSearchParams } from 'expo-router';

import { WarehouseForm } from '../../../screens/warehouses/warehouse-form';

// Add or edit a warehouse — a full page on a phone, a Dialog over Warehouses on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function WarehousePage() {
  const { merchantId, warehouseId, parentId } = useLocalSearchParams<{ merchantId: string; warehouseId?: string; parentId?: string }>();

  return <WarehouseForm merchantId={merchantId} warehouseId={warehouseId} parentId={parentId} onDismiss={() => router.back()} />;
}
