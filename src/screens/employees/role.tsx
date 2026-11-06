import { zodResolver } from '@hookform/resolvers/zod';
import { router, useNavigation } from 'expo-router';
import { useState } from 'react';
import { useForm, useFormState } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { useConfirm } from '../../components/confirm-dialog';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { Text } from '../../components/text';
import { useLeaveGuard } from '../../components/use-leave-guard';
import type { Merchant } from '../../features/merchants/queries';
import { useDeleteRoleMutation } from '../../features/roles/queries';
import type { RoleWithGrants } from '../../features/roles/queries';
import { roleSchema } from '../../features/roles/schema';
import type { RoleValues } from '../../features/roles/schema';
import { useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { spacing } from '../../themes';
import { OwnerOnly } from './index';
import { RoleEditor, roleValues } from './editor/role-editor';
import { useEmployees } from './use-employees';
import type { EmployeesData } from './use-employees';

/** What deleting a role does to whoever holds it. */
const deleteRoleBody = (role: RoleWithGrants, data: EmployeesData) => {
  const held = data.members.filter((member) => member.role_id === role.id).length;
  return held === 0
    ? 'Nobody holds it.'
    : `${held} ${held === 1 ? 'employee holds' : 'employees hold'} it: they stay in the store with no role, and see Home only, until you give them another.`;
};

/** Delete Role and its confirm, for the page and the tablet's pane. `ask` is absent for a role not yet saved; render `dialog`. */
export function useDeleteRole(role: RoleWithGrants | undefined, data: EmployeesData, onDone: () => void) {
  const remove = useDeleteRoleMutation();
  const confirm = useConfirm();
  const ask = role
    ? () =>
        confirm.ask({
          title: `Delete ${role.role_name}?`,
          body: deleteRoleBody(role, data),
          confirmLabel: 'Delete',
          run: () => remove.mutateAsync(role.id),
          failure: () => failureMessage("Couldn't delete the role. Try again."),
          onDone,
        })
    : undefined;

  return { ask, dialog: confirm.dialog, gone: remove.isPending || remove.isSuccess };
}

/** One role as a page of the Employees stack, new without `roleId`: the phone's way in. A tablet edits it beside the list. */
export function RolePage({ merchant, isOwner, roleId }: { merchant: Merchant; isOwner: boolean; roleId?: string }) {
  const employees = useEmployees(merchant.id);
  // A new role, once saved, stays on this page as the saved one.
  const [createdId, setCreatedId] = useState<string>();
  const id = roleId ?? createdId;
  const role = employees.data?.roles.find((candidate) => candidate.id === id);

  if (!isOwner) return <OwnerOnly title="Role" />;

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Roles" title={role?.role_name ?? 'New Role'} onBack={() => router.back()} />
      {employees.data && (role || !roleId) ? (
        <Editor merchantId={merchant.id} role={role} roleId={id} data={employees.data} onCreated={setCreatedId} />
      ) : (
        <View style={styles.state}>
          <QueryState query={employees} offline="You're offline. The role will load when you reconnect." failure="Couldn't load the role. Try again.">
            {/* Loaded, and the role is not there: deleted, or a stale link. */}
            <Text variant="bodyMedium">This role no longer exists.</Text>
          </QueryState>
        </View>
      )}
    </View>
  );
}

function Editor({ merchantId, role, roleId, data, onCreated }: { merchantId: string; role?: RoleWithGrants; roleId?: string; data: EmployeesData; onCreated: (id: string) => void }) {
  const navigation = useNavigation();
  const wide = useShellWide();
  // The page pops through its own navigator, and on a phone the confirm's sheet of the outer stack pops too
  // (RecordPageHeader's reason).
  const remove = useDeleteRole(role, data, () => {
    navigation.goBack();
    if (!wide) router.back();
  });
  const form = useForm<RoleValues>({ resolver: zodResolver(roleSchema), defaultValues: roleValues(role, data.members), mode: 'onTouched' });
  // Subscribed, as the editor's is: the form object never changes identity under the React Compiler.
  const { isDirty } = useFormState({ control: form.control });
  // A deleted role has nothing left to lose: leaving then asks nothing.
  const leaveGuard = useLeaveGuard(isDirty, remove.gone);

  return (
    <>
      {leaveGuard}
      <RoleEditor
        merchantId={merchantId}
        roleId={roleId}
        form={form}
        catalog={data.catalog}
        members={data.members}
        roles={data.roles}
        onSaved={onCreated}
        actions={{ onDelete: remove.ask, onDiscard: () => form.reset() }}
      />
      {remove.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
});
