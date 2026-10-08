import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledSwitch, ControlledText, FieldGrid } from '../../components/form-fields';
import { NoteCallout } from '../../components/note-callout';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { ALL_ROLE, useDeleteRoleMutation, useRolesQuery, useSaveRoleMutation } from '../../features/roles/queries';
import type { Role } from '../../features/roles/queries';
import { roleSchema } from '../../features/roles/schema';
import type { RoleValues } from '../../features/roles/schema';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';

type Props = { merchantId: string; roleId?: string; onDismiss: () => void };

/** Create a custom role or edit one — the body of src/app/(app)/forms/role.tsx (page narrow, Dialog wide). */
export function RoleForm({ merchantId, roleId, onDismiss }: Props) {
  const roles = useRolesQuery({ merchantId });
  // The list this form was opened from fetched the same key, so this is a cache hit.
  if (!roles.data) return null;
  const existing = roleId ? roles.data.find((role) => role.id === roleId) : undefined;

  return <Form merchantId={merchantId} existing={existing} onDismiss={onDismiss} />;
}

const saveFailure = (error: Error | null) =>
  postgrestError(error)?.code === '23505' ? 'There is already a role with this name.' : failureMessage("Couldn't save this role. Try again.");

const defaults = (existing: Role | undefined): RoleValues => ({ role_name: existing?.role_name ?? '', disabled: existing?.disabled ?? false });

function Form({ merchantId, existing, onDismiss }: { merchantId: string; existing: Role | undefined; onDismiss: () => void }) {
  const wide = useShellWide();
  const save = useSaveRoleMutation({ merchantId, roleId: existing?.id });
  const remove = useDeleteRoleMutation();
  const confirm = useConfirm();
  // A standard role keeps its name and is never deleted (private.guard_roles); All is never disabled.
  const standard = existing?.is_standard ?? false;
  const deletable = !standard && can(usePermissions({ merchantId }).data, 'Role', 'delete');
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit } = useForm<RoleValues>({ resolver: zodResolver(roleSchema), defaultValues: defaults(existing), mode: 'onTouched' });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (role: Role) =>
    confirm.ask({
      title: `Delete role ${role.role_name}?`,
      body: 'Users lose what this role allowed them, and its rules leave the Role Permissions Manager.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(role.id),
      failure: () => failureMessage("Couldn't delete this role. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="Role"
        title={existing?.role_name ?? 'New role'}
        notice={notice}
        actions={
          <FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />
        }
      >
        {standard ? <NoteCallout>A standard role keeps its name, and cannot be deleted. Disable it to stop it granting anything.</NoteCallout> : null}
        <FieldGrid>
          {standard ? null : (
            <ControlledText control={control} name="role_name" label="Role Name" required span="full" placeholder="e.g. Shift Lead" maxLength={60} />
          )}
          {existing?.role_name === ALL_ROLE ? null : (
            <ControlledSwitch control={control} name="disabled" label="Disabled" span="full" on="Grants nothing to the users who hold it" off="In use" />
          )}
        </FieldGrid>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}
