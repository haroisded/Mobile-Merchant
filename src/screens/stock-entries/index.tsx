import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { ledgerMeta } from '../../components/ledger-filters';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { DOCSTATUS } from '../../features/documents/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useStockEntriesQuery } from '../../features/stock-entries/queries';
import type { StockEntry } from '../../features/stock-entries/queries';
import { useWarehousesQuery, warehouseLabel } from '../../features/warehouses/queries';
import { displayDate } from '../../lib/dates';

// A document with rows: a page of the Stock stack at every width (.claude/instruction_mds/frontend.md §4.4).
const openEntry = (merchantId: string, docId?: string) =>
  router.push({ pathname: '/systems/[id]/stock/stock-entry', params: docId ? { id: merchantId, docId } : { id: merchantId } });

/**
 * Stock Entries (docs.frappe.io/erpnext/stock-entry): stock received, issued or moved between warehouses,
 * newest first. A draft is still being written; a submitted one has moved its stock.
 */
export function StockEntries({ merchant }: { merchant: Merchant }) {
  const entries = useStockEntriesQuery({ merchantId: merchant.id });
  const warehouses = useWarehousesQuery({ merchantId: merchant.id }).data;
  const permissions = usePermissions({ merchantId: merchant.id }).data;

  const warehouse = (id: string | null) => {
    const found = warehouses?.find((candidate) => candidate.id === id);
    return found ? warehouseLabel(found) : null;
  };
  // "Stores - CC → Back Room - CC" for a transfer; the one warehouse a receipt or an issue has otherwise.
  const route = (entry: StockEntry) => [warehouse(entry.from_warehouse), warehouse(entry.to_warehouse)].filter((name) => name !== null).join(' → ');
  const status = (entry: StockEntry) => <StatusText words={[DOCSTATUS[entry.docstatus]]} faint={entry.docstatus === 2} />;

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Stock"
        title="Stock Entries"
        meta={ledgerMeta(entries.data?.length, 'stock entry', 'stock entries')}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Stock Entry', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openEntry(merchant.id)} contentStyle={styles.leading}>
              New Stock Entry
            </Button>
          ) : null
        }
      />
      <RecordList
        query={entries}
        keyOf={(entry) => entry.id}
        columns={[
          { label: 'Number', flex: 3, cell: (entry) => entry.name },
          { label: 'Purpose', flex: 2, cell: (entry) => entry.purpose },
          { label: 'Posting Date', flex: 2, cell: (entry) => displayDate(entry.posting_date) },
          { label: 'Warehouse', flex: 3, cell: route },
          { label: 'Status', flex: 1, cell: () => '', node: status },
        ]}
        title={(entry) => entry.name}
        subtitle={(entry) => [entry.purpose, displayDate(entry.posting_date), route(entry)].filter(Boolean).join(' · ')}
        status={status}
        accessibilityLabel={(entry) => `Stock entry ${entry.name}, ${DOCSTATUS[entry.docstatus]}`}
        onPress={can(permissions, 'Stock Entry', 'read') ? (entry) => openEntry(merchant.id, entry.id) : undefined}
        empty="No stock entries yet."
        offline="You're offline. Stock entries will load when you reconnect."
        failure="Couldn't load stock entries. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
