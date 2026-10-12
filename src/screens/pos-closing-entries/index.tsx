import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ledgerMeta } from '../../components/ledger-filters';
import { PageHeader } from '../../components/page-header';
import { RecordList } from '../../components/record-list';
import { useMoney } from '../../features/currencies/queries';
import type { Merchant } from '../../features/merchants/queries';
import { usePosClosingEntriesQuery } from '../../features/pos-closing-entries/queries';
import { displayDate } from '../../lib/dates';

/** POS Closing Entries (docs.frappe.io/erpnext/pos-closing-entry): each closed session, newest first, with what it sold. */
export function PosClosingEntries({ merchant }: { merchant: Merchant }) {
  const entries = usePosClosingEntriesQuery({ merchantId: merchant.id });
  const money = useMoney(merchant);

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Sell" title="POS Closing Entries" meta={ledgerMeta(entries.data?.length, 'closing entry', 'closing entries')} onBack={() => router.back()} />
      <RecordList
        query={entries}
        keyOf={(entry) => entry.id}
        columns={[
          { label: 'Number', flex: 3, cell: (entry) => entry.name },
          { label: 'Date', flex: 2, cell: (entry) => displayDate(entry.posting_date) },
          { label: 'Grand Total', flex: 2, cell: (entry) => money(entry.grand_total) },
        ]}
        title={(entry) => entry.name}
        subtitle={(entry) => `${displayDate(entry.posting_date)} · ${money(entry.grand_total)} sold`}
        accessibilityLabel={(entry) => `Closing entry ${entry.name}`}
        onPress={(entry) => router.push({ pathname: '/systems/[id]/sell/pos-closing-entry', params: { id: merchant.id, docId: entry.id } })}
        empty="No session has been closed yet."
        offline="You're offline. Closing entries will load when you reconnect."
        failure="Couldn't load closing entries. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
