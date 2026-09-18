import { router, useLocalSearchParams } from 'expo-router';

import { RemoveSystemDialog } from '../../../components/remove-system-dialog';
import { useMerchantsQuery } from '../../../features/merchants/queries';

// Remove a POS system on a narrow container (instruction_mds/visual-language.md §5).
export default function RemoveSystemSheet() {
  const { merchantId } = useLocalSearchParams<{ merchantId: string }>();
  const merchant = useMerchantsQuery().data?.find((row) => row.id === merchantId);

  if (!merchant) return null;

  return <RemoveSystemDialog merchant={merchant} wide={false} inSheet onDismiss={() => router.back()} />;
}
