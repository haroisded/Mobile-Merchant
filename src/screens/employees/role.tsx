import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { QueryState } from '../../components/query-state';
import { RecordPageHeader } from '../../components/record-page-header';
import { Text } from '../../components/text';
import type { Merchant } from '../../features/merchants/queries';
import { useDeleteRoleMutation } from '../../features/roles/queries';
import type { RoleWithGrants } from '../../features/roles/queries';
import { roleSchema } from '../../features/roles/schema';
import type { RoleValues } from '../../features/roles/schema';
import { failureMessage } from '../../lib/errors';
import { spacing } from '../../themes';
import { OwnerOnly } from './index';
import { RoleEditor, roleValues } from './editor/role-editor';
import { useEmployees } from './use-employees';
import type { EmployeesData } from './use-employees';

/** What deleting a role does to whoever holds it. */
export const deleteRoleBody = (role: RoleWithGrants, data: EmployeesData) => {
  const held = data.members.filter((member) => member.role_id === role.id).length;
  return held === 0
    ? 'Nobody holds it.'
    : `${held} ${held === 1 ? 'employee holds' : 'employees hold'} it: they stay in the store with no role, and see Home only, until you give them another.`;
};

/** One role as a page of the Employees stack, new without `roleId`: the phone's way in. A tablet edits it beside the list. */
export function RolePage({ merchant, isOwner, roleId }: { merchant: Merchant; isOwner: boolean; roleId?: string }) {
  const employees = useEmployees(merchant.id);
  const remove = useDeleteRoleMutation();
  // A new role, once saved, stays on this page as the saved one.
  const [createdId, setCreatedId] = useState<string>();
  const id = roleId ?? createdId;
  const role = employees.data?.roles.find((candidate) => candidate.id === id);

  if (!isOwner) return <OwnerOnly title="Role" />;

  return (
    <View style={styles.fill}>
      <RecordPageHeader
        kicker="Roles"
        title={role?.role_name ?? 'New Role'}
        remove={
          role && employees.data
            ? {
                title: `Delete ${role.role_name}?`,
                body: deleteRoleBody(role, employees.data),
                run: () => remove.mutateAsync(role.id),
                failure: () => failureMessage("Couldn't delete the role. Try again."),
              }
            : undefined
        }
      />
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
  const form = useForm<RoleValues>({ resolver: zodResolver(roleSchema), defaultValues: roleValues(role, data.members), mode: 'onTouched' });

  return <RoleEditor merchantId={merchantId} roleId={roleId} form={form} catalog={data.catalog} members={data.members} roles={data.roles} onSaved={onCreated} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
});
