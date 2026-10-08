import { router, useLocalSearchParams } from 'expo-router';

import { UserForm } from '../../../screens/users/user-form';

// Invite or edit a user — a full page on a phone, a Dialog over Users on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function UserPage() {
  const { merchantId, memberId } = useLocalSearchParams<{ merchantId: string; memberId?: string }>();

  return <UserForm merchantId={merchantId} memberId={memberId} onDismiss={() => router.back()} />;
}
