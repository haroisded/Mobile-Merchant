import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useRolesQuery } from '../../features/roles/queries';
import type { Role } from '../../features/roles/queries';

const openForm = (merchantId: string, roleId?: string) =>
  router.push({ pathname: '/forms/role', params: roleId ? { merchantId, roleId } : { merchantId } });

const roleStatus = (role: Role) => [role.is_standard ? 'Standard' : 'Custom', role.disabled ? 'Disabled' : null].filter((word) => word !== null);

/**
 * Roles (docs.frappe.io/erpnext/role-and-role-profile): the standard roles every system starts with, and
 * the custom ones added here. What each role may do is set in the Role Permissions Manager.
 */
export function Roles({ merchantId }: { merchantId: string }) {
  const roles = useRolesQuery({ merchantId });
  const permissions = usePermissions({ merchantId }).data;
  const editable = can(permissions, 'Role', 'write');

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Roles"
        meta={roles.data ? `${roles.data.length} ${roles.data.length === 1 ? 'role' : 'roles'}` : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Role', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openForm(merchantId)} contentStyle={styles.leading}>
              New Role
            </Button>
          ) : null
        }
      />
      <RecordList
        query={roles}
        keyOf={(role) => role.id}
        columns={[
          { label: 'Role', flex: 2, cell: (role) => role.role_name },
          { label: 'Kind', flex: 1, cell: () => '', node: (role) => <StatusText words={roleStatus(role)} faint={role.disabled} /> },
        ]}
        title={(role) => role.role_name}
        status={(role) => <StatusText words={roleStatus(role)} faint={role.disabled} />}
        accessibilityLabel={(role) => `Role ${role.role_name}`}
        onPress={editable ? (role) => openForm(merchantId, role.id) : undefined}
        empty="No roles yet."
        offline="You're offline. Roles will load when you reconnect."
        failure="Couldn't load roles. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
