import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList } from '../../components/record-list';
import { useRoleProfilesQuery } from '../../features/role-profiles/queries';
import type { RoleProfile } from '../../features/role-profiles/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useRolesQuery } from '../../features/roles/queries';
import type { Role } from '../../features/roles/queries';

const openForm = (merchantId: string, roleProfileId?: string) =>
  router.push({ pathname: '/forms/role-profile', params: roleProfileId ? { merchantId, roleProfileId } : { merchantId } });

/** "Sales Manager, Sales User" — a profile's roles by name. */
function roleNames(profile: RoleProfile, roles: Role[] | undefined) {
  const ids = new Set(profile.role_profile_roles.map((link) => link.role_id));
  return (roles ?? []).filter((role) => ids.has(role.id)).map((role) => role.role_name).join(', ');
}

/**
 * Role Profiles (docs.frappe.io/erpnext/role-and-role-profile): a named set of roles, so a cashier gets
 * every role a cashier needs in one choice on their user.
 */
export function RoleProfiles({ merchantId }: { merchantId: string }) {
  const profiles = useRoleProfilesQuery({ merchantId });
  const roles = useRolesQuery({ merchantId }).data;
  const permissions = usePermissions({ merchantId }).data;

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Role Profiles"
        meta={profiles.data ? `${profiles.data.length} ${profiles.data.length === 1 ? 'profile' : 'profiles'}` : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Role Profile', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openForm(merchantId)} contentStyle={styles.leading}>
              New Role Profile
            </Button>
          ) : null
        }
      />
      <RecordList
        query={profiles}
        keyOf={(profile) => profile.id}
        columns={[
          { label: 'Role Profile', flex: 1, cell: (profile) => profile.role_profile_name },
          { label: 'Roles', flex: 2, cell: (profile) => roleNames(profile, roles) },
        ]}
        title={(profile) => profile.role_profile_name}
        subtitle={(profile) => roleNames(profile, roles)}
        accessibilityLabel={(profile) => `Role profile ${profile.role_profile_name}`}
        onPress={can(permissions, 'Role Profile', 'write') ? (profile) => openForm(merchantId, profile.id) : undefined}
        empty="No role profiles yet."
        offline="You're offline. Role profiles will load when you reconnect."
        failure="Couldn't load role profiles. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
