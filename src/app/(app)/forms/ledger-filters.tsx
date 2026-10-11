import { router, useLocalSearchParams } from 'expo-router';

import { LedgerFiltersPanel } from '../../../components/ledger-filters';
import type { LedgerReport } from '../../../Store/ledger-filters';

// A ledger report's Filters panel — a full page on a phone, a Dialog over the report on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx). Nothing is saved: the filters
// are client state (src/Store/ledger-filters.ts), and the report underneath reads them.
export default function LedgerFiltersPage() {
  const { merchantId, report } = useLocalSearchParams<{ merchantId: string; report: LedgerReport }>();

  return <LedgerFiltersPanel merchantId={merchantId} report={report} onDismiss={() => router.back()} />;
}
