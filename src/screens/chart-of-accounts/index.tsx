import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { TreeBrowser, useFolder } from '../../components/folder-nav';
import { PageHeader } from '../../components/page-header';
import { accountLabel, useAccountsQuery } from '../../features/accounts/queries';
import type { Account } from '../../features/accounts/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { spacing } from '../../themes';

const openForm = (params: { merchantId: string; accountId?: string; parentId?: string }) => router.push({ pathname: '/forms/account', params });

/**
 * Chart of Accounts (docs.frappe.io/erpnext/chart-of-accounts): the five root types, the groups under them,
 * and the ledgers sales and stock post to — browsed a folder at a time. Inside a group: Edit it, or add a
 * group or ledger under it. The roots are fixed, so the top has no New.
 */
export function ChartOfAccounts({ merchant }: { merchant: Merchant }) {
  const accounts = useAccountsQuery({ merchantId: merchant.id });
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const { parent, open } = useFolder('/systems/[id]/setup/chart-of-accounts', merchant.id);
  const folder = accounts.data?.find((account) => account.id === parent);
  const label = (account: Account) => accountLabel(account, merchant.abbr);
  const edit = can(permissions, 'Account', 'write') ? (account: Account) => openForm({ merchantId: merchant.id, accountId: account.id }) : undefined;

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker={folder ? folder.root_type : 'Setup'}
        title={folder ? label(folder) : 'Chart of Accounts'}
        meta={folder ? undefined : 'Open a group to see the accounts under it'}
        onBack={() => router.back()}
        actions={
          folder ? (
            <View style={styles.actions}>
              {edit ? (
                <Button mode="outlined" icon="edit" onPress={() => edit(folder)}>
                  Edit Group
                </Button>
              ) : null}
              {can(permissions, 'Account', 'create') ? (
                <Button mode="contained" icon="add" onPress={() => openForm({ merchantId: merchant.id, parentId: folder.id })}>
                  New Account
                </Button>
              ) : null}
            </View>
          ) : null
        }
      />
      <TreeBrowser
        query={accounts}
        parent={parent}
        root="Chart of Accounts"
        label={label}
        status={(account) => [account.account_type]}
        noun={['account', 'accounts']}
        open={open}
        onEdit={edit}
        offline="You're offline. The Chart of Accounts will load when you reconnect."
        failure="Couldn't load the Chart of Accounts. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
