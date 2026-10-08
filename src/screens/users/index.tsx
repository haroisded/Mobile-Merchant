import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { Text } from '../../components/text';
import { memberStatus, useMembersQuery } from '../../features/members/queries';
import type { Member } from '../../features/members/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import type { Permissions } from '../../features/role-permissions/queries';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';

const openForm = (merchantId: string, memberId?: string) =>
  router.push({ pathname: '/forms/user', params: memberId ? { merchantId, memberId } : { merchantId } });

const statusWords = (member: Member) => [memberStatus(member)];

/**
 * Users (docs.frappe.io/erpnext/adding-users): the people who may work in this system, invited by email.
 * The owner is ERPNext's Administrator — pinned first, never restricted, never removed. An invite becomes
 * Active the first time that person signs in with the same, confirmed email.
 */
export function Users({ merchantId }: { merchantId: string }) {
  const members = useMembersQuery({ merchantId });
  const permissions = usePermissions({ merchantId }).data;

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Users"
        meta={members.data ? `${members.data.length + 1} ${members.data.length === 0 ? 'user' : 'users'}` : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'User', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openForm(merchantId)} contentStyle={styles.leading}>
              New User
            </Button>
          ) : null
        }
      />
      <RecordList
        query={members}
        keyOf={(member) => member.id}
        header={<OwnerRow permissions={permissions} />}
        columns={[
          { label: 'Email', flex: 2, cell: (member) => member.email },
          { label: 'Name', flex: 1.5, cell: (member) => member.full_name ?? '' },
          { label: 'Status', flex: 1, cell: () => '', node: (member) => <StatusText words={statusWords(member)} faint={!member.enabled} /> },
        ]}
        title={(member) => member.full_name ?? member.email}
        subtitle={(member) => member.email}
        status={(member) => <StatusText words={statusWords(member)} faint={!member.enabled} />}
        accessibilityLabel={(member) => `User ${member.email}, ${memberStatus(member)}`}
        onPress={can(permissions, 'User', 'write') ? (member) => openForm(merchantId, member.id) : undefined}
        empty="Nobody else has been invited yet."
        offline="You're offline. Users will load when you reconnect."
        failure="Couldn't load users. Try again."
      />
    </View>
  );
}

/** The owner, pinned: not a row of the table, so it carries its own labels. */
function OwnerRow({ permissions }: { permissions: Permissions | null | undefined }) {
  const { colors } = useAppTheme();
  if (!permissions) return null;

  return (
    <View style={[styles.owner, { borderBottomColor: colors.surfaceVariant, backgroundColor: colors.surfaceMuted }]}>
      <Text variant="titleMedium">{permissions.owner_name ?? permissions.owner_email ?? 'Owner'}</Text>
      {permissions.owner_name && permissions.owner_email ? (
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {permissions.owner_email}
        </Text>
      ) : null}
      <StatusText words={[permissions.is_owner ? 'You' : 'Owner', 'Administrator', 'Every permission']} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
  owner: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1 },
});
