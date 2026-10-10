import { router, useLocalSearchParams } from 'expo-router';

import { LetterHeadForm } from '../../../screens/letter-heads/letter-head-form';

// Create or edit a letter head — a full page on a phone, a Dialog over Letter Heads on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function LetterHeadPage() {
  const { merchantId, letterHeadId } = useLocalSearchParams<{ merchantId: string; letterHeadId?: string }>();

  return <LetterHeadForm merchantId={merchantId} letterHeadId={letterHeadId} onDismiss={() => router.back()} />;
}
