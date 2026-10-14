import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { Text } from '../../components/text';
import { memberName, memberStatus, useMembersQuery } from '../../features/members/queries';
import type { Member } from '../../features/members/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import type { Permissions } from '../../features/role-permissions/queries';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';

const openForm = (merchantId: string, memberId: string) => router.push({ pathname: '/forms/user', params: { merchantId, memberId } });

const statusWords = (member: Member) => [memberStatus(member)];

/**
 * Users (docs.frappe.io/erpnext/adding-users): the people who may work in this system. They join with an access
 * code the owner approves (src/screens/access-codes/), never from here. The owner is ERPNext's Administrator —
 * pinned first, never restricted, never removed.
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
      />
      <RecordList
        query={members}
        keyOf={(member) => member.id}
        header={<OwnerRow permissions={permissions} />}
        columns={[
          { label: 'Name', flex: 1.5, cell: (member) => memberName(member) },
          { label: 'Email', flex: 2, cell: (member) => member.email ?? '' },
          { label: 'Status', flex: 1, cell: () => '', node: (member) => <StatusText words={statusWords(member)} faint={!member.enabled} /> },
        ]}
        title={(member) => memberName(member)}
        subtitle={(member) => member.email ?? ''}
        status={(member) => <StatusText words={statusWords(member)} faint={!member.enabled} />}
        accessibilityLabel={(member) => `User ${memberName(member)}, ${memberStatus(member)}`}
        onPress={can(permissions, 'User', 'write') ? (member) => openForm(merchantId, member.id) : undefined}
        empty="Nobody else has joined yet. People join with an access code."
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
  owner: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1 },
});
