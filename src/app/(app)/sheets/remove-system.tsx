import { router, useLocalSearchParams } from 'expo-router';

import { RemoveSystemDialog } from '../../../components/remove-system-dialog';
import { useMerchantsQuery } from '../../../features/merchants/queries';

// Remove one store or several on a narrow container (.claude/instruction_mds/frontend.md §5). `merchantIds` is a
// comma list: one id from a card's delete icon, several from the list's selection bar.
export default function RemoveSystemSheet() {
  const { merchantIds = '' } = useLocalSearchParams<{ merchantIds?: string }>();
  const ids = merchantIds.split(',');
  const merchants = (useMerchantsQuery().data ?? []).filter((row) => ids.includes(row.id));

  if (merchants.length === 0) return null;

  return <RemoveSystemDialog merchants={merchants} inSheet onDismiss={() => router.back()} />;
}
