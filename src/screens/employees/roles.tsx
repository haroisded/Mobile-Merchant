import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm, useFormState } from 'react-hook-form';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { useConfirm } from '../../components/confirm-dialog';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { Text } from '../../components/text';
import type { Merchant } from '../../features/merchants/queries';
import { useDeleteRoleMutation } from '../../features/roles/queries';
import { roleSchema } from '../../features/roles/schema';
import type { RoleValues } from '../../features/roles/schema';
import { useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';
import { OwnerOnly } from './index';
import { deleteRoleBody } from './role';
import { RoleDot } from './role-chip';
import { RoleEditor, roleValues } from './editor/role-editor';
import { useEmployees } from './use-employees';
import type { EmployeesData } from './use-employees';
import { useDiscard } from '../../components/use-discard';

/**
 * Roles: each role's colour, how many hold it and how many permissions it has. On a phone a row opens the role's
 * page; on a tablet the role opens beside the list, as the Roles mock draws it.
 */
export function RolesScreen({ merchant, isOwner }: { merchant: Merchant; isOwner: boolean }) {
  const wide = useShellWide();
  const employees = useEmployees(merchant.id);

  if (!isOwner) return <OwnerOnly title="Roles" />;

  const count = employees.data?.roles.length;
  const open = (roleId?: string) => router.push({ pathname: '/systems/[id]/employees/role', params: roleId ? { id: merchant.id, roleId } : { id: merchant.id } });

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker={merchant.name}
        title="Roles"
        meta={count === undefined ? undefined : `${count} ${count === 1 ? 'role' : 'roles'}`}
        onBack={() => router.back()}
        actions={
          wide ? null : (
            <Button mode="contained" icon="add" onPress={() => open()} contentStyle={styles.leading}>
              New Role
            </Button>
          )
        }
      />
      {employees.data ? (
        wide ? (
          <RolePanes merchantId={merchant.id} data={employees.data} />
        ) : (
          <RoleRows data={employees.data} onOpen={open} />
        )
      ) : (
        <View style={styles.state}>
          <QueryState query={employees} offline="You're offline. Roles will load when you reconnect." failure="Couldn't load roles. Try again." />
        </View>
      )}
    </View>
  );
}

/** The roles, one row each; the one open beside them on a tablet on `surfaceMuted`. */
function RoleRows({ data, selected, onOpen }: { data: EmployeesData; selected?: string; onOpen: (roleId: string) => void }) {
  const { colors } = useAppTheme();
  const held = (roleId: string) => data.members.filter((member) => member.role_id === roleId).length;

  return (
    <FlatList
      data={data.roles}
      keyExtractor={(role) => role.id}
      ListEmptyComponent={<Text variant="bodyMedium" style={styles.state}>No roles yet. Make one, then give it to your employees.</Text>}
      renderItem={({ item: role }) => {
        const holders = held(role.id);
        const meta = `${holders} ${holders === 1 ? 'employee' : 'employees'} · ${role.role_grants.length} ${role.role_grants.length === 1 ? 'permission' : 'permissions'}`;

        return (
          <Pressable
            onPress={() => onOpen(role.id)}
            // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
            android_ripple={{ color: colors.ripple }}
            accessibilityRole="button"
            accessibilityLabel={`${role.role_name}, ${meta}`}
            accessibilityState={{ selected: role.id === selected }}
            style={[styles.row, { borderBottomColor: colors.surfaceVariant }, role.id === selected ? { backgroundColor: colors.surfaceMuted } : null]}
          >
            <RoleDot color={role.color} />
            <View style={styles.rowText}>
              <Text variant="titleMedium">{role.role_name}</Text>
              <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                {meta}
              </Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

/** A tablet's Roles: the list, and the open role's editor beside it. Leaving unsaved changes asks first. */
function RolePanes({ merchantId, data }: { merchantId: string; data: EmployeesData }) {
  const { colors } = useAppTheme();
  // The open role; undefined while a new one is being made.
  const [selected, setSelected] = useState<string | undefined>(data.roles[0]?.id);
  const role = data.roles.find((candidate) => candidate.id === selected);
  const form = useForm<RoleValues>({ resolver: zodResolver(roleSchema), defaultValues: roleValues(role, data.members), mode: 'onTouched' });
  // Subscribed during render: `form.formState` read only inside `choose` is the last render's, so a first change
  // would slip past the ask.
  const { isDirty } = useFormState({ control: form.control });
  const discard = useDiscard();
  const remove = useDeleteRoleMutation();
  const confirm = useConfirm();

  const go = (roleId: string | undefined) => {
    setSelected(roleId);
    form.reset(roleValues(data.roles.find((candidate) => candidate.id === roleId), data.members));
  };
  const choose = (roleId: string | undefined) => discard.ask(isDirty, () => go(roleId));

  const askDelete = role
    ? () =>
        confirm.ask({
          title: `Delete ${role.role_name}?`,
          body: deleteRoleBody(role, data),
          confirmLabel: 'Delete',
          run: () => remove.mutateAsync(role.id),
          failure: () => failureMessage("Couldn't delete the role. Try again."),
          onDone: () => go(data.roles.find((candidate) => candidate.id !== role.id)?.id),
        })
    : undefined;

  return (
    <View style={styles.panes}>
      <View style={[styles.listPane, { borderRightColor: colors.outlineVariant }]}>
        <View style={styles.paneTop}>
          <Button mode="contained" icon="add" onPress={() => choose(undefined)} style={styles.hug}>
            New Role
          </Button>
        </View>
        <RoleRows data={data} selected={selected} onOpen={choose} />
      </View>
      <View style={styles.editorPane}>
        <RoleEditor
          merchantId={merchantId}
          roleId={role?.id}
          form={form}
          catalog={data.catalog}
          members={data.members}
          roles={data.roles}
          onSaved={setSelected}
          wideActions={{ onDelete: askDelete, onDiscard: () => form.reset() }}
        />
      </View>
      {discard.dialog}
      {confirm.dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  leading: { justifyContent: 'flex-start' },
  hug: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1 },
  rowText: { flex: 1, gap: spacing.xs },
  panes: { flex: 1, flexDirection: 'row' },
  // The list beside the editor: two parts in five of the pane.
  listPane: { flex: 2, borderRightWidth: 1 },
  editorPane: { flex: 3 },
  paneTop: { padding: spacing.md },
});
