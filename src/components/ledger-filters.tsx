import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { accountLabel, useAccountsQuery } from '../features/accounts/queries';
import { itemLabel, useItemsQuery } from '../features/items/queries';
import { useMerchantsQuery } from '../features/merchants/queries';
import { useWarehousesQuery, warehouseLabel } from '../features/warehouses/queries';
import { displayDate } from '../lib/dates';
import { LEDGER_PAGE } from '../lib/query';
import { useAppTheme } from '../lib/theme';
import { NO_FILTERS, setLedgerFilters, useLedgerFilters } from '../Store/ledger-filters';
import type { LedgerFilters, LedgerReport } from '../Store/ledger-filters';
import type { PickOption } from '../Store/picker';
import { spacing } from '../themes';
import { AdaptiveDialog } from './adaptive-dialog';
import { Button } from './button';
import { Chip } from './chip';
import { DateInput, Field, FieldGrid } from './form-fields';
import { SearchSelect } from './search-select';
import { TextInput } from './text-input';

// What the three ledger reports share — the General Ledger, the Stock Ledger and the Stock Balance: the names
// their rows show, the Filters button with its chips, the Filters panel, and the way from a row to its
// document and from a document to its entries (.claude/instruction_mds/frontend.md §5, Filter + sort).

type FilterName = keyof LedgerFilters;

// Each report's name, and the filters it has in the panel's order.
const REPORTS = {
  'general-ledger': { title: 'General Ledger', fields: ['from', 'to', 'account', 'voucher'] },
  'stock-ledger': { title: 'Stock Ledger', fields: ['from', 'to', 'item', 'warehouse', 'voucher'] },
  'stock-balance': { title: 'Stock Balance', fields: ['item', 'warehouse'] },
} satisfies Record<LedgerReport, { title: string; fields: FilterName[] }>;

const fieldsOf = (report: LedgerReport): FilterName[] => REPORTS[report].fields;

/**
 * The records a ledger row or a filter names — ledger accounts, stock items and warehouses that hold stock —
 * each as picker options. Every member may select them (All's Select on each), so whoever reads a report can
 * read its names. All three load whichever report asks: each is a short list the other screens already hold.
 */
export function useLedgerNames(merchantId: string) {
  const abbr = useMerchantsQuery().data?.find((merchant) => merchant.id === merchantId)?.abbr ?? '';
  const accounts = useAccountsQuery({ merchantId }).data ?? [];
  const items = useItemsQuery({ merchantId }).data ?? [];
  const warehouses = useWarehousesQuery({ merchantId }).data ?? [];

  return {
    account: accounts.filter((account) => !account.is_group).map((account): PickOption => ({ value: account.id, label: accountLabel(account, abbr) })),
    // Disabled items too: a ledger keeps the movements of an item that was disabled since.
    item: items.filter((item) => item.is_stock_item).map((item): PickOption => ({ value: item.id, label: itemLabel(item) })),
    warehouse: warehouses
      .filter((warehouse) => !warehouse.is_group)
      .map((warehouse): PickOption => ({ value: warehouse.id, label: warehouseLabel(warehouse, abbr) })),
  };
}

type LedgerNames = ReturnType<typeof useLedgerNames>;

/** A record's name out of its options: a placeholder while they load, or for one the reader's roles hide. */
export const nameIn = (options: PickOption[], id: string) => options.find((option) => option.value === id)?.label ?? '…';

/** A report's meta line: how many rows, or that it shows only the newest page of them (LEDGER_PAGE). */
export const ledgerMeta = (count: number | undefined, one: string, many: string) => {
  if (count === undefined) return undefined;
  return count >= LEDGER_PAGE ? `The newest ${LEDGER_PAGE} ${many} — filter to reach older ones` : `${count} ${count === 1 ? one : many}`;
};

const chipLabel = (field: FilterName, value: string, names: LedgerNames) => {
  if (field === 'from') return `From ${displayDate(value)}`;
  if (field === 'to') return `To ${displayDate(value)}`;
  return field === 'voucher' ? value : nameIn(names[field], value);
};

/**
 * Under a report's header: the Filters button, then a Chip for each filter in force — tapped, it removes
 * that filter — and Clear all. The panel is a route — a page narrow, a Dialog wide — so the button only
 * opens it.
 */
export function LedgerFilterBar({ merchantId, report, names }: { merchantId: string; report: LedgerReport; names: LedgerNames }) {
  const { colors } = useAppTheme();
  const filters = useLedgerFilters(merchantId, report);
  const active = fieldsOf(report).filter((field) => filters[field] !== '');

  return (
    <View style={styles.bar}>
      <Button mode="outlined" onPress={() => router.push({ pathname: '/forms/ledger-filters', params: { merchantId, report } })}>
        {active.length > 0 ? `Filters · ${active.length}` : 'Filters'}
      </Button>
      {active.map((field) => {
        const label = chipLabel(field, filters[field], names);
        return (
          // The whole chip removes its filter, the × leading: not `onClose` (src/components/chip.tsx).
          <Chip key={field} icon="close" onPress={() => setLedgerFilters(merchantId, report, { ...filters, [field]: '' })} accessibilityLabel={`Remove ${label}`}>
            {label}
          </Chip>
        );
      })}
      {active.length > 0 ? (
        <Button mode="text" textColor={colors.accent} onPress={() => setLedgerFilters(merchantId, report, NO_FILTERS)}>
          Clear all
        </Button>
      ) : null}
    </View>
  );
}

type PanelProps = { merchantId: string; report: LedgerReport; onDismiss: () => void };

/**
 * A report's Filters panel, the body of src/app/(app)/forms/ledger-filters.tsx (page narrow, Dialog wide). A
 * pick applies as it is made — the report under a Dialog narrows at once — so there is Done and no Apply.
 * Rejected: fields above the list (three lines of them on a phone, .claude/instruction_mds/frontend.md §7),
 * and a formSheet, which cannot host the picker a select opens.
 */
export function LedgerFiltersPanel({ merchantId, report, onDismiss }: PanelProps) {
  const filters = useLedgerFilters(merchantId, report);
  const names = useLedgerNames(merchantId);
  const fields = fieldsOf(report);
  // A number is typed, so it applies when its field is left or the panel is done: applied letter by letter,
  // every letter would be a request for a voucher that does not exist.
  const [voucher, setVoucher] = useState(filters.voucher);
  const apply = (next: LedgerFilters) => setLedgerFilters(merchantId, report, { ...next, voucher: voucher.trim() });

  return (
    <AdaptiveDialog
      asPage
      onDismiss={onDismiss}
      kicker={REPORTS[report].title}
      title="Filters"
      actions={
        <>
          <Button
            mode="outlined"
            onPress={() => {
              setVoucher('');
              setLedgerFilters(merchantId, report, NO_FILTERS);
            }}
            contentStyle={styles.action}
          >
            Clear all
          </Button>
          <Button
            mode="contained"
            onPress={() => {
              apply(filters);
              onDismiss();
            }}
            contentStyle={styles.action}
          >
            Done
          </Button>
        </>
      }
    >
      <FieldGrid>
        {fields.includes('from') ? (
          <Field label="From Date">
            <DateInput value={filters.from} onChange={(from) => apply({ ...filters, from })} placeholder="Any" accessibilityLabel="From Date" clearable />
          </Field>
        ) : null}
        {fields.includes('to') ? (
          <Field label="To Date">
            <DateInput value={filters.to} onChange={(to) => apply({ ...filters, to })} placeholder="Any" accessibilityLabel="To Date" clearable />
          </Field>
        ) : null}
        {fields.includes('account') ? (
          <SearchSelect
            label="Account"
            title="Account"
            value={filters.account}
            onChange={(account) => apply({ ...filters, account })}
            options={[{ value: '', label: 'Any' }, ...names.account]}
          />
        ) : null}
        {fields.includes('item') ? (
          <SearchSelect label="Item" title="Item" value={filters.item} onChange={(item) => apply({ ...filters, item })} options={[{ value: '', label: 'Any' }, ...names.item]} />
        ) : null}
        {fields.includes('warehouse') ? (
          <SearchSelect
            label="Warehouse"
            title="Warehouse"
            value={filters.warehouse}
            onChange={(warehouse) => apply({ ...filters, warehouse })}
            options={[{ value: '', label: 'Any' }, ...names.warehouse]}
          />
        ) : null}
        {fields.includes('voucher') ? (
          <Field label="Voucher No." hint="A document's number, in full" span="full">
            <TextInput
              mode="outlined"
              dense
              value={voucher}
              onChangeText={setVoucher}
              onEndEditing={() => apply(filters)}
              placeholder="e.g. MAT-STE-2026-00001"
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Voucher No."
            />
          </Field>
        ) : null}
      </FieldGrid>
    </AdaptiveDialog>
  );
}

// The page of each document a ledger row can name, by its doctype (public.doctypes.name).
const DOCUMENT_ROUTES = new Map<string, 'stock-entry' | 'stock-reconciliation' | 'pos-invoice'>([
  ['POS Invoice', 'pos-invoice'],
  ['Stock Entry', 'stock-entry'],
  ['Stock Reconciliation', 'stock-reconciliation'],
]);

/**
 * From a ledger row to its document, and from a document to its entries — in the stack of the rail
 * destination the reader is in, so Back returns to where they were. Each destination therefore has both the
 * document pages and the reports: src/app/(app)/systems/[id]/accounts/ re-exports stock/'s, and the reverse;
 * sell/ holds the POS Invoice and its return and re-exports the rest.
 * Rejected: pushing into the other destination's stack — Back would pop that stack instead of returning.
 */
export function useVoucherRoutes(merchantId: string) {
  // "/systems/<id>/accounts/general-ledger": the destination is the third part.
  const part = usePathname().split('/')[3];
  const destination = part === 'accounts' || part === 'sell' ? part : 'stock';

  return {
    /** A ledger row's source document. Nothing happens for a voucher type that has no page yet. */
    openDocument: (voucherType: string, docId: string) => {
      const route = DOCUMENT_ROUTES.get(voucherType);
      if (route) router.push({ pathname: `/systems/[id]/${destination}/${route}`, params: { id: merchantId, docId } });
    },
    /** The page a sale is returned from. */
    openReturn: (docId: string) => router.push({ pathname: `/systems/[id]/${destination}/pos-return`, params: { id: merchantId, docId } }),
    /** A return just made, in place of the page that made it: Back from its receipt is the sale. */
    showReturn: (docId: string) => router.replace({ pathname: `/systems/[id]/${destination}/pos-invoice`, params: { id: merchantId, docId } }),
    /** A report narrowed first: to a document's own entries, or to one item's movements in one warehouse. */
    openReport: (report: 'general-ledger' | 'stock-ledger', filters: Partial<LedgerFilters>) => {
      setLedgerFilters(merchantId, report, { ...NO_FILTERS, ...filters });
      router.push({ pathname: `/systems/[id]/${destination}/${report}`, params: { id: merchantId } });
    },
  };
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  action: { justifyContent: 'flex-start' },
});
