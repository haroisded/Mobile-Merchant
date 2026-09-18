import { router, useLocalSearchParams } from 'expo-router';

import { DeleteTaxClassDialog } from '../../../components/delete-tax-class-dialog';
import { useTaxClassesQuery } from '../../../features/tax-classes/queries';

// Delete a tax class on a narrow container (instruction_mds/visual-language.md §5).
export default function DeleteTaxClassSheet() {
  const { merchantId, taxClassId } = useLocalSearchParams<{ merchantId: string; taxClassId: string }>();
  const taxClass = useTaxClassesQuery({ merchantId }).data?.find((row) => row.id === taxClassId);

  if (!taxClass) return null;

  return <DeleteTaxClassDialog taxClass={taxClass} inSheet onDismiss={() => router.back()} />;
}
