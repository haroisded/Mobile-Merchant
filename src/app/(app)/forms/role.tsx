import { router, useLocalSearchParams } from 'expo-router';

import { RoleForm } from '../../../screens/roles/role-form';

// Create or edit a role — a full page on a phone, a Dialog over Roles on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function RolePage() {
  const { merchantId, roleId } = useLocalSearchParams<{ merchantId: string; roleId?: string }>();

  return <RoleForm merchantId={merchantId} roleId={roleId} onDismiss={() => router.back()} />;
}
