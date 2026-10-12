import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { PricingRulePage } from '../../../../../screens/pricing-rules/pricing-rule-form';

// One Pricing Rule, new without `ruleId`. A page of the Setup stack at every width: a form with rows
// (.claude/instruction_mds/frontend.md §4.4).
export default function PricingRuleRoute() {
  const { id, ruleId } = useLocalSearchParams<{ id: string; ruleId?: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <PricingRulePage merchant={merchant} ruleId={ruleId} /> : null;
}
