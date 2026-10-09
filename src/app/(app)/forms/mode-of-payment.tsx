import { router, useLocalSearchParams } from 'expo-router';

import { ModeOfPaymentForm } from '../../../screens/modes-of-payment/mode-of-payment-form';

// Create or edit a mode of payment — a full page on a phone, a Dialog over Modes of Payment on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function ModeOfPaymentPage() {
  const { merchantId, modeId } = useLocalSearchParams<{ merchantId: string; modeId?: string }>();

  return <ModeOfPaymentForm merchantId={merchantId} modeId={modeId} onDismiss={() => router.back()} />;
}
