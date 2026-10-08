import { router, useLocalSearchParams } from 'expo-router';

import { useFiscalYearsQuery } from '../../../features/fiscal-years/queries';
import { DeleteFiscalYear } from '../../../screens/fiscal-years/fiscal-year-form';

// Delete a fiscal year on a narrow container (.claude/instruction_mds/frontend.md §4.4), opened from the
// fiscal-year form. A delete closes this sheet and the form under it in one pop of this stack.
export default function DeleteFiscalYearSheet() {
  const { merchantId, fiscalYearId } = useLocalSearchParams<{ merchantId: string; fiscalYearId: string }>();
  // The form underneath read the same key, so this is a cache hit.
  const year = useFiscalYearsQuery({ merchantId }).data?.find((row) => row.id === fiscalYearId);

  if (!year) return null;

  return <DeleteFiscalYear year={year} inSheet onDismiss={() => router.back()} onDeleted={() => router.dismiss(2)} />;
}
