import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../../components/button';
import { FilterChips } from '../../../components/filter-chips';
import { RowBox } from '../../../components/row-box';
import { Text } from '../../../components/text';
import { displayDate } from '../../../lib/dates';
import { useAppTheme } from '../../../lib/theme';
import { spacing } from '../../../themes';
import { useSandbox } from '../sandbox/context';
import { GuideTarget } from '../sandbox/guide-target';
import type { Store } from '../sandbox-state';
import { T } from '../tasks';
import { Frame, IndexBoxes, ListRow, peso } from './frame';

// Accounts in the practice store (src/screens/accounts/, general-ledger/): the General Ledger a sale writes, kept to
// three accounts so the debit and credit can be followed.

type Account = 'Cash' | 'Sales' | 'VAT';
type Entry = { account: Account; date: string; voucher: string; debit: number; credit: number; saleId: string };

/** What each submitted sale and return wrote: Cash debited, Sales and VAT credited (the other way round for a return). */
function ledger(store: Store): Entry[] {
  return store.sales
    .filter((sale) => sale.status === 'Submitted')
    .flatMap((sale) => {
      const side = (value: number) => (value >= 0 ? { debit: value, credit: 0 } : { debit: 0, credit: -value });
      const flip = (value: number) => (value >= 0 ? { debit: 0, credit: value } : { debit: -value, credit: 0 });
      return [
        { account: 'Cash' as const, date: sale.date, voucher: sale.number, saleId: sale.id, ...side(sale.total) },
        { account: 'Sales' as const, date: sale.date, voucher: sale.number, saleId: sale.id, ...flip(sale.net) },
        { account: 'VAT' as const, date: sale.date, voucher: sale.number, saleId: sale.id, ...flip(sale.total - sale.net) },
      ];
    })
    .reverse();
}

export function AccountsIndex() {
  return (
    <Frame title="Accounts" meta="The store's books">
      <IndexBoxes
        sections={[
          {
            title: 'Reports',
            rows: [{ label: 'General Ledger', hint: 'Every debit and credit of the books', show: true, page: 'general-ledger', target: T.accountsLedger }],
          },
        ]}
      />
    </Frame>
  );
}

export function GeneralLedger() {
  const { store, back, did } = useSandbox();
  const { colors } = useAppTheme();
  const [filtering, setFiltering] = useState(false);
  const [account, setAccount] = useState<Account | 'All'>('All');
  const [open, setOpen] = useState<number | null>(null);
  const rows = ledger(store).filter((entry) => account === 'All' || entry.account === account);

  return (
    <Frame title="General Ledger" meta={`${rows.length} entries`} onBack={back}>
      <GuideTarget target={T.ledgerFilters}>
        <View style={styles.filters}>
          <Button mode="outlined" icon="tune" onPress={() => setFiltering((shown) => !shown)} style={styles.hug}>
            {account === 'All' ? 'Filters' : 'Filters · 1'}
          </Button>
          {filtering ? (
            <FilterChips
              options={[
                { value: 'All', label: 'All' },
                { value: 'Cash', label: 'Cash' },
                { value: 'Sales', label: 'Sales' },
                { value: 'VAT', label: 'VAT' },
              ]}
              value={account}
              onChange={(value) => {
                setAccount(value);
                setOpen(null);
                if (value !== 'All') did(T.ledgerFilters);
              }}
            />
          ) : null}
        </View>
      </GuideTarget>
      <GuideTarget target={T.ledgerRow}>
        <RowBox empty="No entries.">
          {rows.map((entry, index) => (
            <View key={`${entry.voucher}-${entry.account}`}>
              <ListRow
                first={index === 0}
                title={entry.account}
                sub={`${displayDate(entry.date)} · ${entry.voucher}`}
                figure={entry.debit > 0 ? `Dr ${peso(entry.debit)}` : `Cr ${peso(entry.credit)}`}
                onPress={() => {
                  did(T.ledgerRow);
                  setOpen(open === index ? null : index);
                }}
              />
              {open === index ? (
                <View style={[styles.details, { borderTopColor: colors.surfaceVariant }]}>
                  <Text variant="bodySmall">{`Written by the sale ${entry.voucher}. In a real store this row opens that sale.`}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </RowBox>
      </GuideTarget>
    </Frame>
  );
}

const styles = StyleSheet.create({
  filters: { gap: spacing.sm, padding: spacing.xs },
  hug: { alignSelf: 'flex-start' },
  details: { padding: spacing.ms, borderTopWidth: 1 },
});
