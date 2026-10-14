import { router } from 'expo-router';

import { EnterAccessCodeForm } from '../../../screens/access-codes/enter-access-code-form';

// Use a code someone sent — a full page on a phone, a Dialog over Home on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function EnterAccessCodePage() {
  return <EnterAccessCodeForm onDismiss={() => router.back()} />;
}
