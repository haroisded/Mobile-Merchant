import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NoteCallout } from '../../components/note-callout';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { SearchSelect } from '../../components/search-select';
import { SessionAmountsForm } from '../../components/session-amounts-form';
import type { Merchant } from '../../features/merchants/queries';
import { useModesOfPaymentQuery } from '../../features/modes-of-payment/queries';
import { useOpenPosSessionMutation } from '../../features/pos-opening-entries/queries';
import { usePosProfilesQuery } from '../../features/pos-profiles/queries';
import { failureMessage, postgrestError } from '../../lib/errors';
import { spacing } from '../../themes';

const openFailure = (error: Error | null) =>
  postgrestError(error)?.code === '23505'
    ? 'You already have an open session on this POS Profile. Close it first.'
    : failureMessage("Couldn't open the session. Try again.");

/**
 * Open a session (docs.frappe.io/erpnext/pos-opening-entry): the POS Profile to sell on, and what each of its
 * payment methods holds before the first sale. The database dates it and numbers it.
 *
 * ponytail: every enabled profile is listed, and the database refuses one whose users leave the cashier out
 * (private.pos_profile_usable). Listing only the cashier's own needs their member row on the device.
 */
export function OpenSession({ merchant }: { merchant: Merchant }) {
  const profiles = usePosProfilesQuery({ merchantId: merchant.id });
  const modes = useModesOfPaymentQuery({ merchantId: merchant.id }).data;
  const open = useOpenPosSessionMutation({ merchantId: merchant.id });
  const [picked, setPicked] = useState<string>();

  const usable = (profiles.data ?? []).filter((profile) => !profile.disabled);
  // The only profile needs no picking.
  const profileId = picked ?? (usable.length === 1 ? usable[0].id : '');
  const profile = usable.find((candidate) => candidate.id === profileId);
  const methods = (profile?.pos_profile_payments ?? []).map((row) => ({
    id: row.mode_of_payment_id,
    label: modes?.find((mode) => mode.id === row.mode_of_payment_id)?.mode_of_payment ?? 'Payment method',
  }));

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Sell" title="Open Session" meta="What the drawer starts with" onBack={() => router.back()} />
      {profiles.data === undefined ? (
        <View style={styles.state}>
          <QueryState query={profiles} offline="You're offline. POS Profiles will load when you reconnect." failure="Couldn't load POS Profiles. Try again." />
        </View>
      ) : (
        <SessionAmountsForm
          // The amounts are the profile's payment methods: another profile is another form.
          key={profileId}
          modes={methods}
          hint="Opening amount"
          submitLabel="Open Session"
          mutation={{ ...open, mutate: (values, options) => open.mutate({ profileId, values }, options) }}
          failure={openFailure}
          ready={profile !== undefined}
          onDone={() => router.back()}
        >
          {usable.length === 0 ? <NoteCallout>No POS Profile is enabled yet. Add one in Setup → POS Profiles first.</NoteCallout> : null}
          <SearchSelect
            label="POS Profile"
            required
            span="full"
            title="POS Profile"
            value={profileId}
            options={usable.map((candidate) => ({ value: candidate.id, label: candidate.pos_profile_name }))}
            onChange={setPicked}
          />
        </SessionAmountsForm>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
});
