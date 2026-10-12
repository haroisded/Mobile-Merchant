import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { NoteCallout } from '../../components/note-callout';
import { PageHeader } from '../../components/page-header';
import { SessionState, useRegisterSession } from '../../components/pos-session';
import { SessionAmountsForm } from '../../components/session-amounts-form';
import type { Merchant } from '../../features/merchants/queries';
import { useModesOfPaymentQuery } from '../../features/modes-of-payment/queries';
import { useClosePosSessionMutation } from '../../features/pos-closing-entries/queries';
import { failureMessage } from '../../lib/errors';

const closeFailure = () => failureMessage("Couldn't close the session. Try again.");

/**
 * Close a session (docs.frappe.io/erpnext/pos-closing-entry): what each payment method was counted to hold.
 * The database works out what each should hold — its opening amount and the session's payments, less the
 * change given — and the difference, then shows them on the closing entry this page is replaced by. `docId`
 * is a session other than the reader's own, opened from POS Opening Entries.
 */
export function CloseSession({ merchant, docId }: { merchant: Merchant; docId?: string }) {
  const { query, session, profile } = useRegisterSession(merchant.id, docId);
  const modes = useModesOfPaymentQuery({ merchantId: merchant.id }).data;
  const close = useClosePosSessionMutation({ merchantId: merchant.id });
  if (!session || !profile) return <SessionState title="Close Session" query={query} />;

  // The profile's methods, then any the session opened with that the profile has dropped since.
  const ids = [...new Set([...profile.pos_profile_payments.map((row) => row.mode_of_payment_id), ...session.pos_opening_entry_balances.map((row) => row.mode_of_payment_id)])];

  return (
    <View style={styles.fill}>
      <PageHeader kicker={profile.pos_profile_name} title="Close Session" meta={`Session ${session.name}`} onBack={() => router.back()} />
      <SessionAmountsForm
        modes={ids.map((id) => ({ id, label: modes?.find((mode) => mode.id === id)?.mode_of_payment ?? 'Payment method' }))}
        hint="Counted"
        submitLabel="Close Session"
        mutation={{ ...close, mutate: (values, options) => close.mutate({ sessionId: session.id, values }, options) }}
        failure={closeFailure}
        ready
        // The closing entry takes this page's place: Back from it returns to where the session was closed from.
        onDone={(closingId: string) => router.replace({ pathname: '/systems/[id]/sell/pos-closing-entry', params: { id: merchant.id, docId: closingId } })}
      >
        <NoteCallout>Count what each payment method holds now. Closing works out what it should hold, and no more sales can be rung up in this session.</NoteCallout>
      </SessionAmountsForm>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
