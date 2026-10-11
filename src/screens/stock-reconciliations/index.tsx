import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { ledgerMeta } from '../../components/ledger-filters';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { DOCSTATUS } from '../../features/documents/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useStockReconciliationsQuery } from '../../features/stock-reconciliations/queries';
import type { StockReconciliation } from '../../features/stock-reconciliations/queries';
import { displayDate } from '../../lib/dates';

// A document with rows: a page of the Stock stack at every width (.claude/instruction_mds/frontend.md §4.4).
const openReconciliation = (merchantId: string, docId?: string) =>
  router.push({ pathname: '/systems/[id]/stock/stock-reconciliation', params: docId ? { id: merchantId, docId } : { id: merchantId } });

/**
 * Stock Reconciliations (docs.frappe.io/erpnext/stock-reconciliation, /opening-stock): the first quantities
 * and rates of a system, and each count against the books since, newest first. A new item's Opening Stock
 * lands here too, already submitted.
 */
export function StockReconciliations({ merchant }: { merchant: Merchant }) {
  const reconciliations = useStockReconciliationsQuery({ merchantId: merchant.id });
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const status = (reconciliation: StockReconciliation) => <StatusText words={[DOCSTATUS[reconciliation.docstatus]]} faint={reconciliation.docstatus === 2} />;

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Stock"
        title="Stock Reconciliations"
        meta={ledgerMeta(reconciliations.data?.length, 'stock reconciliation', 'stock reconciliations')}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Stock Reconciliation', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openReconciliation(merchant.id)} contentStyle={styles.leading}>
              New Stock Reconciliation
            </Button>
          ) : null
        }
      />
      <RecordList
        query={reconciliations}
        keyOf={(reconciliation) => reconciliation.id}
        columns={[
          { label: 'Number', flex: 3, cell: (reconciliation) => reconciliation.name },
          { label: 'Purpose', flex: 2, cell: (reconciliation) => reconciliation.purpose },
          { label: 'Posting Date', flex: 2, cell: (reconciliation) => displayDate(reconciliation.posting_date) },
          { label: 'Status', flex: 1, cell: () => '', node: status },
        ]}
        title={(reconciliation) => reconciliation.name}
        subtitle={(reconciliation) => `${reconciliation.purpose} · ${displayDate(reconciliation.posting_date)}`}
        status={status}
        accessibilityLabel={(reconciliation) => `Stock reconciliation ${reconciliation.name}, ${DOCSTATUS[reconciliation.docstatus]}`}
        onPress={can(permissions, 'Stock Reconciliation', 'read') ? (reconciliation) => openReconciliation(merchant.id, reconciliation.id) : undefined}
        empty="No stock reconciliations yet."
        offline="You're offline. Stock reconciliations will load when you reconnect."
        failure="Couldn't load stock reconciliations. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
