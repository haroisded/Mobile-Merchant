import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { accountLabel, useAccountsQuery } from '../../features/accounts/queries';
import type { Merchant } from '../../features/merchants/queries';
import { useModesOfPaymentQuery } from '../../features/modes-of-payment/queries';
import type { ModeOfPayment } from '../../features/modes-of-payment/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';

const openForm = (merchantId: string, modeId?: string) =>
  router.push({ pathname: '/forms/mode-of-payment', params: modeId ? { merchantId, modeId } : { merchantId } });

const modeStatus = (mode: ModeOfPayment) => [mode.type, mode.enabled ? null : 'Disabled'].filter((word) => word !== null);

/**
 * Modes of Payment (docs.frappe.io/erpnext/mode-of-payment): how a sale is paid — Cash, Credit Card … — and
 * the ledger each proposes. Only the modes a POS Profile lists will appear at checkout.
 */
export function ModesOfPayment({ merchant }: { merchant: Merchant }) {
  const modes = useModesOfPaymentQuery({ merchantId: merchant.id });
  // Account names for the Default Account column. Every member may select accounts (All's Select on Account).
  const accounts = useAccountsQuery({ merchantId: merchant.id }).data;
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'Mode of Payment', 'write');

  const account = (mode: ModeOfPayment) => {
    const found = accounts?.find((candidate) => candidate.id === mode.default_account);
    return found ? accountLabel(found) : 'No default account';
  };

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Modes of Payment"
        meta={modes.data ? `${modes.data.length} ${modes.data.length === 1 ? 'mode' : 'modes'}` : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Mode of Payment', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openForm(merchant.id)} contentStyle={styles.leading}>
              New Mode of Payment
            </Button>
          ) : null
        }
      />
      <RecordList
        query={modes}
        keyOf={(mode) => mode.id}
        columns={[
          { label: 'Mode of Payment', flex: 2, cell: (mode) => mode.mode_of_payment },
          { label: 'Default Account', flex: 2, cell: account },
          { label: 'Type', flex: 1, cell: () => '', node: (mode) => <StatusText words={modeStatus(mode)} faint={!mode.enabled} /> },
        ]}
        title={(mode) => mode.mode_of_payment}
        subtitle={account}
        status={(mode) => <StatusText words={modeStatus(mode)} faint={!mode.enabled} />}
        accessibilityLabel={(mode) => `Mode of payment ${mode.mode_of_payment}`}
        onPress={editable ? (mode) => openForm(merchant.id, mode.id) : undefined}
        empty="No modes of payment yet."
        offline="You're offline. Modes of payment will load when you reconnect."
        failure="Couldn't load modes of payment. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
