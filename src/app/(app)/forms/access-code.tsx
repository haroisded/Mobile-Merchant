import { router, useLocalSearchParams } from 'expo-router';

import { AccessCodeForm } from '../../../screens/access-codes/access-code-form';

// One access code — a full page on a phone, a Dialog over Access Codes on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function AccessCodePage() {
  const { codeId } = useLocalSearchParams<{ codeId: string }>();

  return <AccessCodeForm codeId={codeId} onDismiss={() => router.back()} />;
}
