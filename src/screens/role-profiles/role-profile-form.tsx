import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledChecklist, ControlledText, FieldGrid } from '../../components/form-fields';
import { useDeleteRoleProfileMutation, useRoleProfilesQuery, useSaveRoleProfileMutation } from '../../features/role-profiles/queries';
import type { RoleProfile } from '../../features/role-profiles/queries';
import { roleProfileSchema } from '../../features/role-profiles/schema';
import type { RoleProfileValues } from '../../features/role-profiles/schema';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { ALL_ROLE, useRolesQuery } from '../../features/roles/queries';
import type { Role } from '../../features/roles/queries';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';

type Props = { merchantId: string; roleProfileId?: string; onDismiss: () => void };

/** Create or edit a role profile — the body of src/app/(app)/forms/role-profile.tsx. */
export function RoleProfileForm({ merchantId, roleProfileId, onDismiss }: Props) {
  const profiles = useRoleProfilesQuery({ merchantId });
  const roles = useRolesQuery({ merchantId });
  if (!profiles.data || !roles.data) return null;
  const existing = roleProfileId ? profiles.data.find((profile) => profile.id === roleProfileId) : undefined;

  return <Form merchantId={merchantId} existing={existing} roles={roles.data} onDismiss={onDismiss} />;
}

type FormProps = { merchantId: string; existing: RoleProfile | undefined; roles: Role[]; onDismiss: () => void };

const saveFailure = (error: Error | null) =>
  postgrestError(error)?.code === '23505'
    ? 'There is already a role profile with this name.'
    : failureMessage("Couldn't save this role profile. Try again.");

const defaults = (existing: RoleProfile | undefined): RoleProfileValues => ({
  role_profile_name: existing?.role_profile_name ?? '',
  role_ids: existing?.role_profile_roles.map((link) => link.role_id) ?? [],
});

// All is every member's already; it is never chosen.
const choosable = (roles: Role[]) =>
  roles.filter((role) => role.role_name !== ALL_ROLE && !role.disabled).map((role) => ({ value: role.id, label: role.role_name }));

function Form({ merchantId, existing, roles, onDismiss }: FormProps) {
  const wide = useShellWide();
  const save = useSaveRoleProfileMutation({ merchantId, roleProfileId: existing?.id });
  const remove = useDeleteRoleProfileMutation();
  const confirm = useConfirm();
  const deletable = can(usePermissions({ merchantId }).data, 'Role Profile', 'delete');
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit } = useForm<RoleProfileValues>({
    resolver: zodResolver(roleProfileSchema),
    defaultValues: defaults(existing),
    mode: 'onTouched',
  });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (profile: RoleProfile) =>
    confirm.ask({
      title: `Delete role profile ${profile.role_profile_name}?`,
      body: 'Users with this profile keep no roles from it; give them roles or another profile.',
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(profile.id),
      failure: () => failureMessage("Couldn't delete this role profile. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="Role profile"
        title={existing?.role_profile_name ?? 'New role profile'}
        notice={notice}
        actions={
          <FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />
        }
      >
        <FieldGrid>
          <ControlledText control={control} name="role_profile_name" label="Role Profile" required span="full" placeholder="e.g. Cashier" maxLength={60} />
          <ControlledChecklist control={control} name="role_ids" label="Roles" required span="full" options={choosable(roles)} />
        </FieldGrid>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}
