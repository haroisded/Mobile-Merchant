import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import type { Merchant } from '../../features/merchants/queries';
import { useModesOfPaymentQuery } from '../../features/modes-of-payment/queries';
import { usePosProfilesQuery } from '../../features/pos-profiles/queries';
import type { PosProfile } from '../../features/pos-profiles/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useWarehousesQuery, warehouseLabel } from '../../features/warehouses/queries';

// A long form with three child tables: a page of the Setup stack at every width, not a forms/ Dialog
// (.claude/instruction_mds/frontend.md §4.4).
const openProfile = (merchantId: string, profileId?: string) =>
  router.push({ pathname: '/systems/[id]/setup/pos-profile', params: profileId ? { id: merchantId, profileId } : { id: merchantId } });

const status = (profile: PosProfile) => (profile.disabled ? ['Disabled'] : ['Enabled']);

/**
 * POS Profiles (docs.frappe.io/erpnext/pos-profile): one per register — where it sells from, what it takes in
 * payment, who may use it. A cashier opens a session on one before the first sale.
 */
export function PosProfiles({ merchant }: { merchant: Merchant }) {
  const profiles = usePosProfilesQuery({ merchantId: merchant.id });
  const warehouses = useWarehousesQuery({ merchantId: merchant.id }).data;
  const modes = useModesOfPaymentQuery({ merchantId: merchant.id }).data;
  const permissions = usePermissions({ merchantId: merchant.id }).data;

  const warehouse = (profile: PosProfile) => {
    const found = warehouses?.find((candidate) => candidate.id === profile.warehouse);
    return found ? warehouseLabel(found, merchant.abbr) : '';
  };
  // "Cash, GCash": what it takes at checkout, the default first as saved.
  const payments = (profile: PosProfile) =>
    profile.pos_profile_payments.map((row) => modes?.find((mode) => mode.id === row.mode_of_payment_id)?.mode_of_payment ?? '…').join(', ');
  const count = profiles.data?.length;

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="POS Profiles"
        meta={count === undefined ? undefined : `${count} ${count === 1 ? 'profile' : 'profiles'}`}
        onBack={() => router.back()}
        actions={
          can(permissions, 'POS Profile', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openProfile(merchant.id)} contentStyle={styles.leading}>
              New POS Profile
            </Button>
          ) : null
        }
      />
      <RecordList
        query={profiles}
        keyOf={(profile) => profile.id}
        columns={[
          { label: 'Name', flex: 2, cell: (profile) => profile.pos_profile_name },
          { label: 'Warehouse', flex: 2, cell: warehouse },
          { label: 'Payment Methods', flex: 3, cell: payments },
          { label: 'Status', flex: 1, cell: () => '', node: (profile) => <StatusText words={status(profile)} faint={profile.disabled} /> },
        ]}
        title={(profile) => profile.pos_profile_name}
        subtitle={(profile) => [warehouse(profile), payments(profile)].filter(Boolean).join(' · ')}
        status={(profile) => <StatusText words={status(profile)} faint={profile.disabled} />}
        accessibilityLabel={(profile) => `POS Profile ${profile.pos_profile_name}`}
        onPress={(profile) => openProfile(merchant.id, profile.id)}
        empty="No POS Profiles yet. Add one for each register before the first sale."
        offline="You're offline. POS Profiles will load when you reconnect."
        failure="Couldn't load the POS Profiles. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
