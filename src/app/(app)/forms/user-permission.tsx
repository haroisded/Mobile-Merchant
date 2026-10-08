import { router, useLocalSearchParams } from 'expo-router';

import { UserPermissionForm } from '../../../screens/user-permissions/user-permission-form';

// Create or edit a User Permission — a full page on a phone, a Dialog over User Permissions on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx). `memberId` preselects the user
// when it was opened from one.
export default function UserPermissionPage() {
  const { merchantId, userPermissionId, memberId } = useLocalSearchParams<{
    merchantId: string;
    userPermissionId?: string;
    memberId?: string;
  }>();

  return <UserPermissionForm merchantId={merchantId} userPermissionId={userPermissionId} memberId={memberId} onDismiss={() => router.back()} />;
}
