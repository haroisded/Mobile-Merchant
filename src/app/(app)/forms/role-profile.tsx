import { router, useLocalSearchParams } from 'expo-router';

import { RoleProfileForm } from '../../../screens/role-profiles/role-profile-form';

// Create or edit a role profile — a full page on a phone, a Dialog over Role Profiles on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function RoleProfilePage() {
  const { merchantId, roleProfileId } = useLocalSearchParams<{ merchantId: string; roleProfileId?: string }>();

  return <RoleProfileForm merchantId={merchantId} roleProfileId={roleProfileId} onDismiss={() => router.back()} />;
}
