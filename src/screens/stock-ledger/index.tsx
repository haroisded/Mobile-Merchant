import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { LedgerFilterBar, ledgerMeta, nameIn, useLedgerNames, useVoucherRoutes } from '../../components/ledger-filters';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { useMoney } from '../../features/currencies/queries';
import type { Merchant } from '../../features/merchants/queries';
import { useStockLedgerEntriesQuery } from '../../features/stock-ledger-entries/queries';
import type { StockLedgerEntry } from '../../features/stock-ledger-entries/queries';
import { displayDate } from '../../lib/dates';
import { useLedgerFilters } from '../../Store/ledger-filters';

/** "+10" or "-3": a movement's quantity, in the item's stock unit. */
const signed = (qty: number) => (qty > 0 ? `+${qty}` : String(qty));

/**
 * The Stock Ledger (docs.frappe.io/erpnext/stock-ledger): every stock movement, newest first — its quantity,
 * the rate it came in at, and the quantity, valuation rate and value the item was left with in that
 * warehouse. Read-only — only a posting writes it — and each row opens the document it came from.
 */
export function StockLedger({ merchant }: { merchant: Merchant }) {
  const { from, to, item, warehouse, voucher } = useLedgerFilters(merchant.id, 'stock-ledger');
  const entries = useStockLedgerEntriesQuery({ merchantId: merchant.id, from, to, item, warehouse, voucher });
  const names = useLedgerNames(merchant.id);
  const money = useMoney(merchant);
  const routes = useVoucherRoutes(merchant.id);

  const itemName = (entry: StockLedgerEntry) => nameIn(names.item, entry.item_id);
  const warehouseName = (entry: StockLedgerEntry) => nameIn(names.warehouse, entry.warehouse_id);
  // Stock going out has no incoming rate, and neither has the row that reverses a cancelled movement: it
  // puts the original value back, whatever rate that works out to (private.reverse_sle).
  const incoming = (entry: StockLedgerEntry) => (entry.incoming_rate > 0 ? money(entry.incoming_rate) : '');
  const words = (entry: StockLedgerEntry) =>
    [
      entry.incoming_rate > 0 ? `${signed(entry.actual_qty)} at ${money(entry.incoming_rate)}` : signed(entry.actual_qty),
      `Balance ${entry.qty_after_transaction}`,
      `Valuation ${money(entry.valuation_rate)}`,
      `Value ${money(entry.stock_value)}`,
      entry.is_cancelled ? 'Cancelled' : null,
    ].filter((word) => word !== null);

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Stock" title="Stock Ledger" meta={ledgerMeta(entries.data?.length, 'movement', 'movements')} onBack={() => router.back()} />
      <LedgerFilterBar merchantId={merchant.id} report="stock-ledger" names={names} />
      <RecordList
        query={entries}
        keyOf={(entry) => String(entry.id)}
        columns={[
          { label: 'Item', flex: 3, cell: itemName },
          { label: 'Posting Date', flex: 2, cell: (entry) => displayDate(entry.posting_date) },
          { label: 'Warehouse', flex: 2, cell: warehouseName },
          { label: 'Qty', flex: 1, cell: (entry) => signed(entry.actual_qty) },
          { label: 'Incoming Rate', flex: 2, cell: incoming },
          { label: 'Valuation Rate', flex: 2, cell: (entry) => money(entry.valuation_rate) },
          { label: 'Balance Qty', flex: 1, cell: (entry) => String(entry.qty_after_transaction) },
          { label: 'Balance Value', flex: 2, cell: (entry) => money(entry.stock_value) },
          { label: 'Voucher', flex: 3, cell: (entry) => (entry.is_cancelled ? `${entry.voucher_no} · Cancelled` : entry.voucher_no) },
        ]}
        title={itemName}
        subtitle={(entry) => `${displayDate(entry.posting_date)} · ${warehouseName(entry)} · ${entry.voucher_type} ${entry.voucher_no}`}
        status={(entry) => <StatusText words={words(entry)} faint={entry.is_cancelled} />}
        accessibilityLabel={(entry) => `${itemName(entry)}, ${signed(entry.actual_qty)}, ${entry.voucher_no}`}
        onPress={(entry) => routes.openDocument(entry.voucher_type, entry.voucher_id)}
        empty={from || to || item || warehouse || voucher ? 'No movement matches these filters.' : 'No stock movements yet. A submitted stock document posts them.'}
        offline="You're offline. The Stock Ledger will load when you reconnect."
        failure="Couldn't load the Stock Ledger. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
