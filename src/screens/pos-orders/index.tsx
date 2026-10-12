import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ledgerMeta } from '../../components/ledger-filters';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { useMoney } from '../../features/currencies/queries';
import { DOCSTATUS } from '../../features/documents/queries';
import type { Merchant } from '../../features/merchants/queries';
import { usePosInvoicesQuery } from '../../features/pos-invoices/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { displayDate } from '../../lib/dates';

type Invoice = NonNullable<ReturnType<typeof usePosInvoicesQuery>['data']>[number];

/**
 * Orders: a system's POS Invoices (docs.frappe.io/erpnext/point-of-sale), newest first. A row reopens the
 * sale's receipt — which is how a receipt is printed again.
 */
export function PosOrders({ merchant }: { merchant: Merchant }) {
  const invoices = usePosInvoicesQuery({ merchantId: merchant.id });
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const money = useMoney(merchant);
  // A return is a POS Invoice too: it says so beside its status, and its total reads below zero.
  const words = (invoice: Invoice) => (invoice.is_return ? ['Return', DOCSTATUS[invoice.docstatus]] : [DOCSTATUS[invoice.docstatus]]);
  const status = (invoice: Invoice) => <StatusText words={words(invoice)} faint={invoice.docstatus === 2} />;

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Sell" title="Orders" meta={ledgerMeta(invoices.data?.length, 'order', 'orders')} onBack={() => router.back()} />
      <RecordList
        query={invoices}
        keyOf={(invoice) => invoice.id}
        columns={[
          { label: 'Number', flex: 3, cell: (invoice) => invoice.name },
          { label: 'Date', flex: 2, cell: (invoice) => displayDate(invoice.posting_date) },
          { label: 'Total', flex: 2, cell: (invoice) => money(invoice.rounded_total) },
          { label: 'Status', flex: 1, cell: () => '', node: status },
        ]}
        title={(invoice) => invoice.name}
        subtitle={(invoice) => `${displayDate(invoice.posting_date)} · ${money(invoice.rounded_total)}`}
        status={status}
        accessibilityLabel={(invoice) => `Order ${invoice.name}, ${money(invoice.rounded_total)}, ${words(invoice).join(', ')}`}
        onPress={
          can(permissions, 'POS Invoice', 'read')
            ? (invoice) => router.push({ pathname: '/systems/[id]/sell/pos-invoice', params: { id: merchant.id, docId: invoice.id } })
            : undefined
        }
        empty="Nothing has been sold yet."
        offline="You're offline. Orders will load when you reconnect."
        failure="Couldn't load orders. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
