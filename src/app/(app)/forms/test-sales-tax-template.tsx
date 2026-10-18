import { router, useLocalSearchParams } from 'expo-router';

import { TestTemplate } from '../../../screens/sales-tax-templates/test-template';

// A saved Sales Taxes and Charges Template on a sample line — a full page on a phone, a Dialog over the list on a
// tablet (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx). Read-only: nothing is saved.
export default function TestSalesTaxTemplatePage() {
  const { merchantId } = useLocalSearchParams<{ merchantId: string }>();

  return <TestTemplate merchantId={merchantId} onDismiss={() => router.back()} />;
}
