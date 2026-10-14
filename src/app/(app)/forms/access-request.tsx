import { router, useLocalSearchParams } from 'expo-router';

import { AccessRequestForm } from '../../../screens/access-codes/access-request-form';

// Approve or decline someone who used a code — a full page on a phone, a Dialog over Access Codes on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function AccessRequestPage() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();

  return <AccessRequestForm requestId={requestId} onDismiss={() => router.back()} />;
}
