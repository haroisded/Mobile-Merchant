import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { PosProfilePage } from '../../../../../screens/pos-profiles/pos-profile-form';

// One POS Profile, new without `profileId`. A page of the Setup stack at every width: a long form with rows
// (.claude/instruction_mds/frontend.md §4.4).
export default function PosProfileRoute() {
  const { id, profileId } = useLocalSearchParams<{ id: string; profileId?: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <PosProfilePage merchant={merchant} profileId={profileId} /> : null;
}
