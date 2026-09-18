import { router, useLocalSearchParams } from 'expo-router';

import { SupplierDialog } from '../../../components/supplier-dialog';
import { setSheetResult } from '../../../Store/sheet-result';

// Create a supplier on a narrow container (instruction_mds/visual-language.md §5); the new row goes back to the
// picker that opened the sheet.
export default function SupplierSheet() {
  const { merchantId, resultKey } = useLocalSearchParams<{ merchantId: string; resultKey?: string }>();

  return (
    <SupplierDialog
      merchantId={merchantId}
      inSheet
      onDismiss={() => router.back()}
      onCreated={(row) => {
        if (resultKey) setSheetResult(resultKey, row.id);
      }}
    />
  );
}
