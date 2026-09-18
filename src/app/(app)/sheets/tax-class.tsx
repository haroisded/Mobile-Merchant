import { router, useLocalSearchParams } from 'expo-router';

import { TaxClassDialog } from '../../../components/tax-class-dialog';
import { setSheetResult } from '../../../Store/sheet-result';

// Create a tax class on a narrow container (instruction_mds/visual-language.md §5); the new row goes back to the
// picker that opened the sheet.
export default function TaxClassSheet() {
  const { merchantId, resultKey } = useLocalSearchParams<{ merchantId: string; resultKey?: string }>();

  return (
    <TaxClassDialog
      merchantId={merchantId}
      inSheet
      onDismiss={() => router.back()}
      onCreated={(row) => {
        if (resultKey) setSheetResult(resultKey, row.id);
      }}
    />
  );
}
