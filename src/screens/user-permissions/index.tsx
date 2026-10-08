import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { useMembersQuery } from '../../features/members/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useUserPermissionsQuery } from '../../features/user-permissions/queries';
import type { UserPermission } from '../../features/user-permissions/queries';
import { useRestrictableRecords } from './records';

const openForm = (merchantId: string, params: { userPermissionId?: string; memberId?: string }) =>
  router.push({ pathname: '/forms/user-permission', params: { merchantId, ...params } });

/** "Default · Only for Fiscal Year · Without descendants" — the switches that are on. */
function flags(permission: UserPermission) {
  return [
    permission.is_default ? 'Default' : null,
    permission.apply_to_all_doctypes ? null : `Only for ${permission.applicable_for ?? ''}`,
    permission.hide_descendants ? 'Without descendants' : null,
  ].filter((word) => word !== null);
}

/**
 * User Permissions (docs.frappe.io/erpnext/user-permissions): restrict a user to particular records of a
 * document type — one fiscal year, one warehouse. Opened from a user's form, it shows that user's only.
 */
export function UserPermissions({ merchantId }: { merchantId: string }) {
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  const list = useUserPermissionsQuery({ merchantId });
  const members = useMembersQuery({ merchantId }).data;
  const permissions = usePermissions({ merchantId }).data;
  const records = useRestrictableRecords({ merchantId });
  const member = members?.find((candidate) => candidate.id === memberId);
  const email = (id: string) => members?.find((candidate) => candidate.id === id)?.email ?? '…';
  const rows = { ...list, data: list.data?.filter((permission) => !memberId || permission.member_id === memberId) };

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="User Permissions"
        meta={member ? member.email : 'Which records each user is restricted to'}
        onBack={() => router.back()}
        actions={
          can(permissions, 'User Permission', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openForm(merchantId, { memberId })} contentStyle={styles.leading}>
              New User Permission
            </Button>
          ) : null
        }
      />
      <RecordList
        query={rows}
        keyOf={(permission) => permission.id}
        columns={[
          { label: 'User', flex: 2, cell: (permission) => email(permission.member_id) },
          { label: 'Allow', flex: 1, cell: (permission) => permission.allow },
          { label: 'For Value', flex: 1.5, cell: (permission) => records.label(permission.for_value) },
          { label: 'Applies', flex: 1.5, cell: () => '', node: (permission) => <StatusText words={flags(permission)} /> },
        ]}
        title={(permission) => `${permission.allow}: ${records.label(permission.for_value)}`}
        subtitle={(permission) => email(permission.member_id)}
        status={(permission) => <StatusText words={flags(permission)} />}
        accessibilityLabel={(permission) => `${email(permission.member_id)} restricted to ${permission.allow} ${records.label(permission.for_value)}`}
        onPress={can(permissions, 'User Permission', 'write') ? (permission) => openForm(merchantId, { userPermissionId: permission.id }) : undefined}
        empty={member ? 'This user is not restricted to any records.' : 'Nobody is restricted to particular records.'}
        offline="You're offline. User permissions will load when you reconnect."
        failure="Couldn't load user permissions. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
