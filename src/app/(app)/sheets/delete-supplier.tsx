import { router, useLocalSearchParams } from 'expo-router';

import { DeleteSupplierDialog } from '../../../components/delete-supplier-dialog';
import { useSuppliersQuery } from '../../../features/suppliers/queries';

// Delete a supplier on a narrow container (instruction_mds/visual-language.md §5).
export default function DeleteSupplierSheet() {
  const { merchantId, supplierId } = useLocalSearchParams<{ merchantId: string; supplierId: string }>();
  const supplier = useSuppliersQuery({ merchantId }).data?.find((row) => row.id === supplierId);

  if (!supplier) return null;

  return <DeleteSupplierDialog supplier={supplier} inSheet onDismiss={() => router.back()} />;
}
