import { router } from 'expo-router';

import { NewAccessCodeForm } from '../../../screens/access-codes/new-access-code-form';

// Make access codes — a full page on a phone, a Dialog over Access Codes on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function NewAccessCodePage() {
  return <NewAccessCodeForm onDismiss={() => router.back()} />;
}
