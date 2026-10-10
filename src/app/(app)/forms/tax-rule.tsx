import { router, useLocalSearchParams } from 'expo-router';

import { TaxRuleForm } from '../../../screens/tax-rules/tax-rule-form';

// Add or edit a tax rule — a full page on a phone, a Dialog over Tax Rules on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function TaxRulePage() {
  const { merchantId, ruleId } = useLocalSearchParams<{ merchantId: string; ruleId?: string }>();

  return <TaxRuleForm merchantId={merchantId} ruleId={ruleId} onDismiss={() => router.back()} />;
}
