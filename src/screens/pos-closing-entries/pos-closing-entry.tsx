import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DocumentState } from '../../components/document-page';
import { PageHeader } from '../../components/page-header';
import { SampleBox, SampleLine } from '../../components/sample-box';
import { SectionHeading } from '../../components/section-heading';
import { Text } from '../../components/text';
import { useMoney } from '../../features/currencies/queries';
import type { Merchant } from '../../features/merchants/queries';
import { useModesOfPaymentQuery } from '../../features/modes-of-payment/queries';
import { usePosClosingEntryQuery } from '../../features/pos-closing-entries/queries';
import { usePosOpeningEntriesQuery } from '../../features/pos-opening-entries/queries';
import { displayDate } from '../../lib/dates';
import { FORM_MEASURE, useBottomInset } from '../../lib/columns';
import { spacing } from '../../themes';

/**
 * One POS Closing Entry: for each payment method what the session opened with, what it should hold, what was
 * counted and the difference — then what the session sold. Nothing here can be changed: the database filled
 * it when the session closed (private.submit_pos_closing_entries).
 */
export function PosClosingEntryPage({ merchant, docId }: { merchant: Merchant; docId: string }) {
  const entry = usePosClosingEntryQuery({ id: docId });
  const modes = useModesOfPaymentQuery({ merchantId: merchant.id }).data;
  const sessions = usePosOpeningEntriesQuery({ merchantId: merchant.id }).data;
  const money = useMoney(merchant);
  const bottom = useBottomInset();
  if (!entry.data) return <DocumentState doctype="POS Closing Entry" query={entry} />;

  const closing = entry.data;
  const session = sessions?.find((candidate) => candidate.id === closing.pos_opening_entry_id);

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="POS Closing Entry"
        title={closing.name}
        meta={[displayDate(closing.posting_date), session ? `Session ${session.name}` : null].filter(Boolean).join(' · ')}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: spacing.md + bottom }]}>
        <SectionHeading title="Payment Reconciliation" hint="What each payment method should hold against what was counted" />
        {closing.pos_closing_entry_payments.map((row) => (
          <SampleBox key={row.id}>
            <Text variant="titleMedium">{modes?.find((mode) => mode.id === row.mode_of_payment_id)?.mode_of_payment ?? 'Payment method'}</Text>
            <SampleLine label="Opening Amount" value={money(row.opening_amount)} />
            <SampleLine label="Expected Amount" value={money(row.expected_amount)} sub="Opening, plus the session's payments, less change given" />
            <SampleLine label="Closing Amount" value={money(row.closing_amount)} sub="As counted" />
            <SampleLine label="Difference" value={money(row.difference)} sub={row.difference === 0 ? 'Counted matches expected' : row.difference > 0 ? 'More than expected' : 'Less than expected'} />
          </SampleBox>
        ))}
        <SectionHeading title="Totals" hint="What the session sold" />
        <SampleBox>
          <SampleLine label="Net Total" value={money(closing.net_total)} />
          <SampleLine label="Grand Total" value={money(closing.grand_total)} />
          <SampleLine label="Total Quantity" value={String(closing.total_quantity)} />
        </SampleBox>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Centred in the pane under its full-width header: a short read-only column held to the left left half the pane empty.
  body: { gap: spacing.ms, padding: spacing.md, width: '100%', maxWidth: FORM_MEASURE, alignSelf: 'center' },
});
