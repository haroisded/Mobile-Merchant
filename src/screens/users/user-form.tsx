import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { StyleSheet } from 'react-native';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledChecklist, ControlledSwitch, ControlledText, Field, FieldGrid } from '../../components/form-fields';
import { ControlledSelect } from '../../components/search-select';
import { Text } from '../../components/text';
import { memberName, memberStatus, useDeleteMemberMutation, useMembersQuery, useSaveMemberMutation } from '../../features/members/queries';
import type { Member } from '../../features/members/queries';
import { memberSchema } from '../../features/members/schema';
import type { MemberValues } from '../../features/members/schema';
import { useRoleProfilesQuery } from '../../features/role-profiles/queries';
import type { RoleProfile } from '../../features/role-profiles/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import type { Permissions } from '../../features/role-permissions/queries';
import { ALL_ROLE, useRolesQuery } from '../../features/roles/queries';
import type { Role } from '../../features/roles/queries';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice } from '../../lib/errors';

type Props = { merchantId: string; memberId: string; onDismiss: () => void };

/**
 * Edit a user — the body of src/app/(app)/forms/user.tsx (page narrow, Dialog wide). Nobody is invited here: people
 * join with an access code (src/screens/access-codes/).
 */
export function UserForm({ merchantId, memberId, onDismiss }: Props) {
  const members = useMembersQuery({ merchantId });
  const roles = useRolesQuery({ merchantId });
  const profiles = useRoleProfilesQuery({ merchantId });
  const existing = members.data?.find((member) => member.id === memberId);
  if (!existing || !roles.data || !profiles.data) return null;

  return <Form merchantId={merchantId} existing={existing} roles={roles.data} profiles={profiles.data} onDismiss={onDismiss} />;
}

type FormProps = { merchantId: string; existing: Member; roles: Role[]; profiles: RoleProfile[]; onDismiss: () => void };

const defaults = (existing: Member): MemberValues => ({
  email: existing.email,
  full_name: existing.full_name ?? '',
  enabled: existing.enabled,
  role_profile_id: existing.role_profile_id ?? '',
  role_ids: existing.member_roles.map((link) => link.role_id),
});

function Form({ merchantId, existing, roles, profiles, onDismiss }: FormProps) {
  const wide = useShellWide();
  const save = useSaveMemberMutation({ merchantId, memberId: existing.id });
  const remove = useDeleteMemberMutation();
  const permissions = usePermissions({ merchantId }).data;
  const confirm = useConfirm();
  const notice = mutationNotice(save, failureMessage("Couldn't save this user. Try again."));

  const { control, handleSubmit } = useForm<MemberValues>({ resolver: zodResolver(memberSchema), defaultValues: defaults(existing), mode: 'onTouched' });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askRemove = (member: Member) =>
    confirm.ask({
      kicker: 'Remove',
      title: `Remove ${memberName(member)}?`,
      body: "They lose this system at once and are told so. Their user permissions go with them; they'd need a new access code to come back.",
      confirmLabel: 'Remove',
      run: () => remove.mutateAsync(member.id),
      failure: () => failureMessage("Couldn't remove this user. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  // Their User Permissions, on the Setup page that lists them: close this form, then open that page.
  const openUserPermissions = (member: Member) => {
    onDismiss();
    router.push({ pathname: '/systems/[id]/setup/user-permissions', params: { id: merchantId, memberId: member.id } });
  };

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker={memberStatus(existing)}
        title={memberName(existing)}
        notice={notice}
        actions={
          <MemberActions
            save={save}
            permissions={permissions}
            onCancel={onDismiss}
            onSave={submit}
            onRemove={() => askRemove(existing)}
            onUserPermissions={() => openUserPermissions(existing)}
          />
        }
      >
        <FieldGrid>
          <Field label="Email" span="full">
            <Text variant="bodyMedium">{existing.email ?? 'No email on their account'}</Text>
          </Field>
          <ControlledText control={control} name="full_name" label="Full Name" span="full" maxLength={120} />
          <ControlledSwitch control={control} name="enabled" label="Enabled" span="full" on="Can sign in to this system" off="Disabled: this system leaves their list" />
          <RolesFields control={control} roles={roles} profiles={profiles} />
        </FieldGrid>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}

type ActionsProps = {
  save: { isPending: boolean; isPaused: boolean };
  permissions: Permissions | null | undefined;
  onCancel: () => void;
  onSave: () => void;
  onRemove: () => void;
  onUserPermissions: () => void;
};

/** An existing member's buttons: Remove and Set User Permissions, each where the caller's roles allow it. */
function MemberActions({ save, permissions, onCancel, onSave, onRemove, onUserPermissions }: ActionsProps) {
  return (
    <FormActions
      mutation={save}
      onCancel={onCancel}
      onSave={onSave}
      onDelete={can(permissions, 'User', 'delete') ? onRemove : undefined}
      deleteLabel="Remove"
      extra={
        can(permissions, 'User Permission', 'read') ? (
          <Button mode="text" onPress={onUserPermissions} disabled={save.isPending && !save.isPaused} contentStyle={styles.action}>
            Set User Permissions
          </Button>
        ) : null
      }
    />
  );
}

type RolesProps = { control: Control<MemberValues>; roles: Role[]; profiles: RoleProfile[] };

/** A role profile, or the user's own roles: ERPNext lets the profile decide when one is set. */
function RolesFields({ control, roles, profiles }: RolesProps) {
  const profileId = useWatch({ control, name: 'role_profile_id' });
  const profile = profiles.find((candidate) => candidate.id === profileId);
  const roleName = (id: string) => roles.find((role) => role.id === id)?.role_name;

  return (
    <>
      <ControlledSelect
        control={control}
        name="role_profile_id"
        label="Role Profile"
        hint="When set, it decides the roles"
        title="Role Profile"
        span="full"
        options={[{ value: '', label: 'None — choose roles below' }, ...profiles.map((candidate) => ({ value: candidate.id, label: candidate.role_profile_name }))]}
      />
      {profile ? (
        <Field label="Roles" span="full">
          <Text variant="bodyMedium">
            {profile.role_profile_roles
              .map((link) => roleName(link.role_id))
              .filter((name) => name !== undefined)
              .join(', ')}
          </Text>
        </Field>
      ) : (
        <ControlledChecklist
          control={control}
          name="role_ids"
          label="Roles"
          span="full"
          // All is every member's already; it is never chosen.
          options={roles
            .filter((role) => role.role_name !== ALL_ROLE)
            .map((role) => ({ value: role.id, label: role.role_name, hint: role.disabled ? 'Disabled: grants nothing' : undefined }))}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  action: { justifyContent: 'flex-start' },
});
