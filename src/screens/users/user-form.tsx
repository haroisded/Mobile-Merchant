import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { StyleSheet } from 'react-native';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledChecklist, ControlledSwitch, ControlledText, Field, FieldGrid } from '../../components/form-fields';
import { NoteCallout } from '../../components/note-callout';
import { ControlledSelect } from '../../components/search-select';
import { Text } from '../../components/text';
import { memberStatus, useDeleteMemberMutation, useMembersQuery, useSaveMemberMutation } from '../../features/members/queries';
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
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';

type Props = { merchantId: string; memberId?: string; onDismiss: () => void };

/** Invite or edit a user — the body of src/app/(app)/forms/user.tsx (page narrow, Dialog wide). */
export function UserForm({ merchantId, memberId, onDismiss }: Props) {
  const members = useMembersQuery({ merchantId });
  const roles = useRolesQuery({ merchantId });
  const profiles = useRoleProfilesQuery({ merchantId });
  if (!members.data || !roles.data || !profiles.data) return null;
  const existing = memberId ? members.data.find((member) => member.id === memberId) : undefined;

  return <Form merchantId={merchantId} existing={existing} roles={roles.data} profiles={profiles.data} onDismiss={onDismiss} />;
}

type FormProps = { merchantId: string; existing: Member | undefined; roles: Role[]; profiles: RoleProfile[]; onDismiss: () => void };

/** The copy for a failed save: the cases the database refuses on purpose get their own. */
function saveFailure(error: Error | null) {
  const cause = postgrestError(error);
  if (cause?.code === '23505') return 'This email is already a user of this system.';
  if (cause?.message === 'member_is_owner') return "That's the owner's email. The owner already has every permission.";
  if (cause?.message === 'member_email_locked') return "An active user's email can't change. Remove them and invite the new address.";
  return failureMessage("Couldn't save this user. Try again.");
}

const defaults = (existing: Member | undefined): MemberValues => ({
  email: existing?.email ?? '',
  full_name: existing?.full_name ?? '',
  enabled: existing?.enabled ?? true,
  role_profile_id: existing?.role_profile_id ?? '',
  role_ids: existing?.member_roles.map((link) => link.role_id) ?? [],
});

/** What the note at the top says: how an invite becomes Active. */
function inviteNote(existing: Member | undefined) {
  if (!existing) return 'No email is sent. Tell them to sign in to Merchant with this address, and this system appears in their list.';
  if (!existing.user_id) return 'Invited. This becomes Active the first time they sign in with this email.';
  return null;
}

function Form({ merchantId, existing, roles, profiles, onDismiss }: FormProps) {
  const wide = useShellWide();
  const save = useSaveMemberMutation({ merchantId, memberId: existing?.id });
  const remove = useDeleteMemberMutation();
  const permissions = usePermissions({ merchantId }).data;
  const confirm = useConfirm();
  const notice = mutationNotice(save, saveFailure(save.error));
  const note = inviteNote(existing);

  const { control, handleSubmit } = useForm<MemberValues>({ resolver: zodResolver(memberSchema), defaultValues: defaults(existing), mode: 'onTouched' });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askRemove = (member: Member) =>
    confirm.ask({
      kicker: 'Remove',
      title: `Remove ${member.email}?`,
      body: 'They lose this system at once. Their user permissions go with them; invite them again to bring them back.',
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
        kicker={existing ? memberStatus(existing) : 'Invite'}
        title={existing ? (existing.full_name ?? existing.email) : 'New user'}
        notice={notice}
        actions={
          existing ? (
            <MemberActions
              save={save}
              permissions={permissions}
              onCancel={onDismiss}
              onSave={submit}
              onRemove={() => askRemove(existing)}
              onUserPermissions={() => openUserPermissions(existing)}
            />
          ) : (
            <FormActions mutation={save} onCancel={onDismiss} onSave={submit} saveLabel="Invite" />
          )
        }
      >
        {note ? <NoteCallout>{note}</NoteCallout> : null}
        <FieldGrid>
          <EmailField control={control} claimed={existing?.user_id ? existing.email : null} />
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

/** ERPNext: an email is the user's ID, so it is fixed once the invite is claimed. */
function EmailField({ control, claimed }: { control: Control<MemberValues>; claimed: string | null }) {
  if (claimed) {
    return (
      <Field label="Email" span="full">
        <Text variant="bodyMedium">{claimed}</Text>
      </Field>
    );
  }
  return <ControlledText control={control} name="email" label="Email" required span="full" placeholder="name@example.com" autoCapitalize="none" maxLength={254} />;
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
