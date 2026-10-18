import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { FilterChips } from '../../components/filter-chips';
import { Icon } from '../../components/icon';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import { memberName } from '../../features/members/queries';
import type { Member } from '../../features/members/queries';
import type { Merchant } from '../../features/merchants/queries';
import { usePermissions } from '../../features/role-permissions/queries';
import { useShellWide } from '../../lib/columns';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';
import { RoleChip } from './role-chip';
import { useEmployees } from './use-employees';

/** An employee's page: the access editor alone on a phone, beside the list on a tablet. */
const openEmployee = (merchantId: string, memberId: string, wide: boolean) =>
  router.push({ pathname: wide ? '/systems/[id]/employees/permissions' : '/systems/[id]/employees/employee', params: { id: merchantId, memberId } });

/** What a non-owner meets on a link to an Employees page: only the owner manages who may do what. */
export function OwnerOnly({ title }: { title: string }) {
  return (
    <View style={styles.fill}>
      <PageHeader kicker="Employees" title={title} onBack={() => router.back()} />
      <Text variant="bodyMedium" style={styles.state}>
        Only the owner of this store manages its employees.
      </Text>
    </View>
  );
}

/**
 * Employees: the people let into this store and the role each holds. The owner's alone — the rail lists it for
 * them only. Roles and, wide, Permissions open from the header; a row opens that employee's permissions.
 */
export function EmployeesScreen({ merchant, isOwner }: { merchant: Merchant; isOwner: boolean }) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const employees = useEmployees(merchant.id);
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const [search, setSearch] = useState('');
  // 'all', 'none' (no role) or a role's id.
  const [filter, setFilter] = useState('all');

  if (!isOwner) return <OwnerOnly title="Employees" />;

  const roles = employees.data?.roles ?? [];
  const roleOf = (member: Member) => roles.find((role) => role.id === member.role_id);
  const needle = search.trim().toLowerCase();
  const found = employees.data?.members.filter(
    (member) =>
      (filter === 'all' || (filter === 'none' ? member.role_id === null : member.role_id === filter)) &&
      `${member.full_name ?? ''} ${member.email ?? ''}`.toLowerCase().includes(needle)
  );
  const count = employees.data?.members.length;

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker={merchant.name}
        title="Employees"
        meta={count === undefined ? undefined : `${count} ${count === 1 ? 'employee' : 'employees'}`}
        actions={
          <>
            <Button mode="outlined" icon="group" onPress={() => router.push({ pathname: '/systems/[id]/employees/roles', params: { id: merchant.id } })}>
              Roles
            </Button>
            {wide ? (
              <Button mode="outlined" icon="shield" onPress={() => router.push({ pathname: '/systems/[id]/employees/permissions', params: { id: merchant.id } })}>
                Permissions
              </Button>
            ) : null}
          </>
        }
      />
      <View style={styles.toolbar}>
        <TextInput
          mode="outlined"
          dense
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or email"
          accessibilityLabel="Search employees"
          left={<TextInput.Icon icon="search" />}
        />
        <FilterChips
          options={[{ value: 'all', label: 'All' }, ...roles.map((role) => ({ value: role.id, label: role.role_name })), { value: 'none', label: 'No role' }]}
          value={filter}
          onChange={setFilter}
        />
      </View>
      <RecordList
        query={{ ...employees, data: found }}
        keyOf={(member) => member.id}
        header={
          // The owner, pinned: every permission, never listed under a role.
          <View style={[styles.owner, { borderBottomColor: colors.surfaceVariant, backgroundColor: colors.surfaceMuted }]}>
            <Text variant="titleMedium">{permissions?.owner_name ?? permissions?.owner_email ?? 'You'}</Text>
            <StatusText words={['You', 'Owner', 'Every permission']} />
          </View>
        }
        columns={[
          { label: 'Employee', flex: 2, cell: memberName },
          { label: 'Contact', flex: 2.5, cell: (member) => member.email ?? '' },
          { label: 'Role', flex: 1.6, cell: () => '', node: (member) => <RoleChip role={roleOf(member)} /> },
          { label: 'Edit', flex: 0.6, cell: () => '', node: () => <Icon source="edit" size={20} color={colors.onSurfaceMuted} /> },
        ]}
        title={memberName}
        subtitle={(member) => (member.full_name ? member.email ?? '' : '')}
        status={(member) => <RoleChip role={roleOf(member)} />}
        accessibilityLabel={(member) => `${memberName(member)}, ${roleOf(member)?.role_name ?? 'no role'}. Edit permissions`}
        onPress={(member) => openEmployee(merchant.id, member.id, wide)}
        empty={
          needle || filter !== 'all'
            ? 'Nobody matches.'
            : 'Nobody has joined yet. Send someone an access code from the Access Codes tab, then approve their request.'
        }
        offline="You're offline. Employees will load when you reconnect."
        failure="Couldn't load employees. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { padding: spacing.md },
  toolbar: { gap: spacing.ms, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.ms },
  owner: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1 },
});
