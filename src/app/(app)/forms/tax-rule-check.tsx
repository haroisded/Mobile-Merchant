import { router, useLocalSearchParams } from 'expo-router';

import { TaxRuleCheck } from '../../../screens/tax-rules/tax-rule-check';

// Which template a sample sale gets — a full page on a phone, a Dialog over Tax Rules on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx). Read-only: nothing is saved.
export default function TaxRuleCheckPage() {
  const { merchantId } = useLocalSearchParams<{ merchantId: string }>();

  return <TaxRuleCheck merchantId={merchantId} onDismiss={() => router.back()} />;
}
