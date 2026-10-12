import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ledgerMeta } from '../../components/ledger-filters';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { useMoney } from '../../features/currencies/queries';
import type { Merchant } from '../../features/merchants/queries';
import { usePosOpeningEntriesQuery } from '../../features/pos-opening-entries/queries';
import type { PosOpeningEntry } from '../../features/pos-opening-entries/queries';
import { usePosProfilesQuery } from '../../features/pos-profiles/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { displayDate } from '../../lib/dates';
import { useSession } from '../../Store/StoreUser';

/**
 * POS Opening Entries (docs.frappe.io/erpnext/pos-opening-entry): each session, newest first, with what its
 * drawer started with. An open one closes from here — its cashier's, or anyone's for whoever may cancel a POS
 * Opening Entry, which is how a manager closes a session left open.
 */
export function PosOpeningEntries({ merchant }: { merchant: Merchant }) {
  const entries = usePosOpeningEntriesQuery({ merchantId: merchant.id });
  const profiles = usePosProfilesQuery({ merchantId: merchant.id }).data;
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const userId = useSession()?.user.id;
  const money = useMoney(merchant);

  const profile = (entry: PosOpeningEntry) => profiles?.find((candidate) => candidate.id === entry.pos_profile_id)?.pos_profile_name ?? '';
  const opening = (entry: PosOpeningEntry) => money(entry.pos_opening_entry_balances.reduce((sum, row) => sum + row.opening_amount, 0));
  const status = (entry: PosOpeningEntry) => <StatusText words={[entry.status]} faint={entry.status === 'Closed'} />;
  const closable = (entry: PosOpeningEntry) => entry.status === 'Open' && (entry.user_id === userId || can(permissions, 'POS Opening Entry', 'cancel'));

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Sell" title="POS Opening Entries" meta={ledgerMeta(entries.data?.length, 'session', 'sessions')} onBack={() => router.back()} />
      <RecordList
        query={entries}
        keyOf={(entry) => entry.id}
        columns={[
          { label: 'Number', flex: 3, cell: (entry) => entry.name },
          { label: 'POS Profile', flex: 3, cell: profile },
          { label: 'Date', flex: 2, cell: (entry) => displayDate(entry.posting_date) },
          { label: 'Opening Amount', flex: 2, cell: opening },
          { label: 'Status', flex: 1, cell: () => '', node: status },
        ]}
        title={(entry) => entry.name}
        subtitle={(entry) => [profile(entry), displayDate(entry.posting_date), `${opening(entry)} opening`].filter(Boolean).join(' · ')}
        status={status}
        accessibilityLabel={(entry) => `Session ${entry.name}, ${entry.status}${closable(entry) ? ', opens Close Session' : ''}`}
        onPress={(entry) => {
          if (closable(entry)) router.push({ pathname: '/systems/[id]/sell/close-session', params: { id: merchant.id, docId: entry.id } });
        }}
        empty="No session has been opened yet."
        offline="You're offline. Sessions will load when you reconnect."
        failure="Couldn't load sessions. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
