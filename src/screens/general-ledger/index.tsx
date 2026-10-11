import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { LedgerFilterBar, ledgerMeta, nameIn, useLedgerNames, useVoucherRoutes } from '../../components/ledger-filters';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { useMoney } from '../../features/currencies/queries';
import { useGlEntriesQuery } from '../../features/gl-entries/queries';
import type { GlEntry } from '../../features/gl-entries/queries';
import type { Merchant } from '../../features/merchants/queries';
import { displayDate } from '../../lib/dates';
import { useLedgerFilters } from '../../Store/ledger-filters';

/**
 * The General Ledger (docs.frappe.io/erpnext/general-ledger): every debit and credit a submitted document
 * posted, newest first, narrowed by account, date and voucher. Read-only — only a posting writes it — and
 * each row opens the document it came from.
 */
export function GeneralLedger({ merchant }: { merchant: Merchant }) {
  const { from, to, account, voucher } = useLedgerFilters(merchant.id, 'general-ledger');
  const entries = useGlEntriesQuery({ merchantId: merchant.id, from, to, account, voucher });
  const names = useLedgerNames(merchant.id);
  const money = useMoney(merchant);
  const routes = useVoucherRoutes(merchant.id);

  const accountName = (entry: GlEntry) => nameIn(names.account, entry.account_id);
  // An entry is one side only: private.post_gl writes a debit or a credit, never both.
  const amount = (entry: GlEntry) => (entry.debit > 0 ? `Debit ${money(entry.debit)}` : `Credit ${money(entry.credit)}`);
  // Immutable Ledger off: a cancelled document's entries stay, marked. On, they are reversed by new ones
  // whose remarks say so.
  const note = (entry: GlEntry) => (entry.is_cancelled ? 'Cancelled' : (entry.remarks ?? ''));

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Accounts" title="General Ledger" meta={ledgerMeta(entries.data?.length, 'entry', 'entries')} onBack={() => router.back()} />
      <LedgerFilterBar merchantId={merchant.id} report="general-ledger" names={names} />
      <RecordList
        query={entries}
        keyOf={(entry) => String(entry.id)}
        columns={[
          { label: 'Account', flex: 4, cell: accountName },
          { label: 'Posting Date', flex: 2, cell: (entry) => displayDate(entry.posting_date) },
          { label: 'Debit', flex: 2, cell: (entry) => money(entry.debit) },
          { label: 'Credit', flex: 2, cell: (entry) => money(entry.credit) },
          { label: 'Voucher', flex: 3, cell: (entry) => entry.voucher_no },
          { label: 'Remarks', flex: 3, cell: note },
        ]}
        title={accountName}
        subtitle={(entry) => [displayDate(entry.posting_date), `${entry.voucher_type} ${entry.voucher_no}`, entry.remarks].filter(Boolean).join(' · ')}
        status={(entry) => <StatusText words={entry.is_cancelled ? [amount(entry), 'Cancelled'] : [amount(entry)]} faint={entry.is_cancelled} />}
        accessibilityLabel={(entry) => `${accountName(entry)}, ${amount(entry)}, ${entry.voucher_no}`}
        onPress={(entry) => routes.openDocument(entry.voucher_type, entry.voucher_id)}
        empty={from || to || account || voucher ? 'No entry matches these filters.' : 'No entries yet. A submitted document posts them.'}
        offline="You're offline. The General Ledger will load when you reconnect."
        failure="Couldn't load the General Ledger. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
