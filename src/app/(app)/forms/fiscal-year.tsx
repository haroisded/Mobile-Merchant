import { router, useLocalSearchParams } from 'expo-router';

import { FiscalYearForm } from '../../../screens/fiscal-years/fiscal-year-form';

// Create or edit a fiscal year — a full page on a phone, a Dialog over Fiscal Years on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function FiscalYearPage() {
  const { merchantId, fiscalYearId } = useLocalSearchParams<{ merchantId: string; fiscalYearId?: string }>();

  return <FiscalYearForm merchantId={merchantId} fiscalYearId={fiscalYearId} onDismiss={() => router.back()} />;
}
