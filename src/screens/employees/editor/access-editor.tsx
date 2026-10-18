import { useController, useFormState, useWatch } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';

import { saveOnce } from '../../../components/adaptive-dialog';
import { Button } from '../../../components/button';
import { NoteCallout } from '../../../components/note-callout';
import { SearchSelect } from '../../../components/search-select';
import { useSaveMemberAccessMutation } from '../../../features/members/queries';
import type { Member } from '../../../features/members/queries';
import { effective, overridesFor } from '../../../features/permissions/access';
import type { Permission } from '../../../features/permissions/queries';
import { roleKeys } from '../../../features/roles/queries';
import type { RoleWithGrants } from '../../../features/roles/queries';
import { accessRefusal, failureMessage, mutationNotice } from '../../../lib/errors';
import { useAppTheme } from '../../../lib/theme';
import { FORM_MEASURE } from '../../../lib/columns';
import { spacing } from '../../../themes';
import { EditorFooter } from './editor-footer';
import { PermissionSwitches } from './permission-switches';

/** An employee's access as the form holds it: their role ('' for none) and every permission they end up with. */
export type AccessValues = { role_id: string; permissions: string[] };

/** What an employee holds now: their role's permissions, with their own exceptions applied. */
export const accessValues = (member: Member, roles: RoleWithGrants[], catalog: Permission[]): AccessValues => ({
  role_id: member.role_id ?? '',
  permissions: effective(catalog, roleKeys(roles.find((role) => role.id === member.role_id)), member.member_overrides),
});

/** What the callout says: how far this employee is from their role. */
function accessNote(differ: number, role: RoleWithGrants | undefined) {
  if (differ > 0) {
    return `${differ} ${differ === 1 ? 'permission differs' : 'permissions differ'} from ${role ? `${role.role_name}'s` : 'having no role'}: this employee's own setting wins.`;
  }
  return role
    ? `Everything here is ${role.role_name}'s. Turn a switch to make an exception for this employee alone.`
    : 'No role: they see Home only, unless you turn something on here.';
}

type Props = {
  member: Member;
  roles: RoleWithGrants[];
  catalog: Permission[];
  /** Held by the page or pane around it, which asks before dropping unsaved changes. */
  form: UseFormReturn<AccessValues>;
  /** Wide, Discard Changes sits beside Save; narrow, Back discards. */
  onDiscard?: () => void;
};

/**
 * One employee's access: their role, and every permission as a switch — the role's own, or this employee's
 * exception to it, which wins (public.member_overrides). The Permissions mock's editor; a page on a phone, the
 * right pane on a tablet.
 */
export function AccessEditor({ member, roles, catalog, form, onDiscard }: Props) {
  const { colors } = useAppTheme();
  const save = useSaveMemberAccessMutation({ memberId: member.id });
  const { control, handleSubmit, reset, setValue } = form;
  // Subscribed, as RoleEditor's is: the form object passed in never changes identity, so the React Compiler would
  // keep a stale `form.formState`.
  const { isDirty } = useFormState({ control });
  const roleId = useWatch({ control, name: 'role_id' });
  const permissions = useController({ control, name: 'permissions' });
  const roleOf = (id: string) => roles.find((candidate) => candidate.id === id);
  const keys = roleKeys(roleOf(roleId));
  const differ = overridesFor(catalog, keys, permissions.field.value).length;

  // Another role keeps this employee's own exceptions: they are taken against the new role's permissions.
  const pickRole = (next: string) => {
    const exceptions = overridesFor(catalog, keys, permissions.field.value);
    setValue('role_id', next, { shouldDirty: true });
    setValue('permissions', effective(catalog, roleKeys(roleOf(next)), exceptions), { shouldDirty: true });
  };

  // What save_member_access is sent: the role, and an exception only where the employee differs from it.
  const submit = handleSubmit(
    saveOnce(
      {
        isPending: save.isPending,
        mutate: (values: AccessValues, options: { onSuccess: () => void }) =>
          save.mutate({ roleId: values.role_id || null, overrides: overridesFor(catalog, roleKeys(roleOf(values.role_id)), values.permissions) }, options),
      },
      (values) => reset(values)
    )
  );

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <SearchSelect
          label="Role"
          title="Role"
          span="full"
          value={roleId}
          options={[{ value: '', label: 'No role' }, ...roles.map((role) => ({ value: role.id, label: role.role_name, hint: `${role.role_grants.length} permissions` }))]}
          onChange={pickRole}
        />
        <NoteCallout>{accessNote(differ, roleOf(roleId))}</NoteCallout>
        {differ > 0 ? (
          <Button mode="text" textColor={colors.accent} onPress={() => setValue('permissions', keys, { shouldDirty: true })} style={styles.hug}>
            {roleId ? "Use the role's permissions" : 'Turn everything off'}
          </Button>
        ) : null}
        <PermissionSwitches
          catalog={catalog}
          value={permissions.field.value}
          onChange={(next) => {
            permissions.field.onChange(next);
            permissions.field.onBlur();
          }}
          roleKeys={keys}
        />
      </ScrollView>
      <EditorFooter
        notice={mutationNotice(save, accessRefusal(save.error) ?? failureMessage("Couldn't save their permissions. Try again."))}
        mutation={save}
        dirty={isDirty}
        saveable={isDirty}
        onSave={submit}
        onDiscard={onDiscard}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { gap: spacing.md, padding: spacing.md, width: '100%', maxWidth: FORM_MEASURE },
  hug: { alignSelf: 'flex-start' },
});
