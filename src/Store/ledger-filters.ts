import { create } from 'zustand';

/** The reports that share the Filters panel (src/components/ledger-filters.tsx). */
export type LedgerReport = 'general-ledger' | 'stock-ledger' | 'stock-balance';

/** A report's filters; '' is "any". Dates are "YYYY-MM-DD", the rest are ids, `voucher` a document's number. */
export type LedgerFilters = { from: string; to: string; account: string; item: string; warehouse: string; voucher: string };

export const NO_FILTERS: LedgerFilters = { from: '', to: '', account: '', item: '', warehouse: '', voucher: '' };

const EMPTY = { 'general-ledger': NO_FILTERS, 'stock-ledger': NO_FILTERS, 'stock-balance': NO_FILTERS };

/**
 * What each report is narrowed to. The panel that sets them is a route of its own
 * (src/app/(app)/forms/ledger-filters.tsx), and a document opens a report already narrowed to itself, so
 * the filters live here rather than in the report's own state — as src/Store/picker.ts holds the open
 * picker. Client state, nothing fetched (.claude/instruction_mds/data-layer.md rule 9).
 */
const useLedgerFiltersStore = create<{ merchantId: string } & Record<LedgerReport, LedgerFilters>>(() => ({ merchantId: '', ...EMPTY }));

/** Filters name one system's records, so another system starts from none. */
export const setLedgerFilters = (merchantId: string, report: LedgerReport, filters: LedgerFilters) =>
  useLedgerFiltersStore.setState((state) => ({ ...(state.merchantId === merchantId ? state : EMPTY), merchantId, [report]: filters }));

export const useLedgerFilters = (merchantId: string, report: LedgerReport) =>
  useLedgerFiltersStore((state) => (state.merchantId === merchantId ? state[report] : NO_FILTERS));
