import { useState } from 'react';
import { useController, useFormState } from 'react-hook-form';
import type { Control, UseFormReturn } from 'react-hook-form';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { sendOnce } from '../../../components/adaptive-dialog';
import { ControlledChecklist, ControlledText, Field, FieldGrid } from '../../../components/form-fields';
import { SegmentedButtons } from '../../../components/segmented-buttons';
import { memberName } from '../../../features/members/queries';
import type { Member } from '../../../features/members/queries';
import type { Permission } from '../../../features/permissions/queries';
import { roleKeys, useSaveRoleMutation } from '../../../features/roles/queries';
import type { RoleWithGrants } from '../../../features/roles/queries';
import { ROLE_COLORS } from '../../../features/roles/schema';
import type { RoleColor, RoleValues } from '../../../features/roles/schema';
import { accessRefusal, failureMessage, mutationNotice } from '../../../lib/errors';
import { useAppTheme } from '../../../lib/theme';
import { spacing } from '../../../themes';
import { EditorFooter } from './editor-footer';
import { PermissionSwitches } from './permission-switches';
import { useRoleColor } from '../role-chip';

type Tab = 'general' | 'permissions' | 'members';

const TABS: { value: Tab; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'permissions', label: 'Permissions' },
  { value: 'members', label: 'Members' },
];

/** A role as its form holds it: the saved role, or a new one — grey, with nothing on and nobody in it. */
export const roleValues = (role: RoleWithGrants | undefined, members: Member[]): RoleValues => ({
  role_name: role?.role_name ?? '',
  description: role?.description ?? '',
  // SAFETY: roles_color holds every role's colour to ROLE_COLORS.
  color: (role?.color ?? 'grey') as RoleColor,
  permissions: roleKeys(role),
  member_ids: role ? members.filter((member) => member.role_id === role.id).map((member) => member.id) : [],
});

type Props = {
  merchantId: string;
  /** The saved role's id; none for a new one. */
  roleId?: string;
  /** Held by the page or pane around it, which asks before dropping unsaved changes. */
  form: UseFormReturn<RoleValues>;
  catalog: Permission[];
  members: Member[];
  roles: RoleWithGrants[];
  onSaved: (id: string) => void;
  /** Wide, Delete Role and Discard Changes sit beside Save; narrow, the page's header carries Delete and Back discards. */
  wideActions?: { onDelete?: () => void; onDiscard: () => void };
};

/**
 * One role: General (name, description, colour), Permissions (the switches) and Members (who holds it), saved
 * together (public.save_role). The Roles mock's editor; a page on a phone, the right pane on a tablet.
 */
export function RoleEditor({ merchantId, roleId, form, catalog, members, roles, onSaved, wideActions }: Props) {
  const save = useSaveRoleMutation({ merchantId, roleId });
  const [tab, setTab] = useState<Tab>('general');
  const { control, handleSubmit, reset, getValues } = form;
  // Subscribed here, not read off `form.formState`: the form object keeps its identity across renders, so the React
  // Compiler (app.json experiments.reactCompiler) never re-renders this editor for a change to it.
  const { isDirty } = useFormState({ control });
  const submit = handleSubmit(
    sendOnce(save, (id: string) => {
      reset(getValues());
      onSaved(id);
    })
  );

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <SegmentedButtons value={tab} onValueChange={setTab} buttons={TABS} />
        {tab === 'general' ? <GeneralFields control={control} /> : null}
        {tab === 'permissions' ? <RolePermissions control={control} catalog={catalog} /> : null}
        {tab === 'members' ? <RoleMembers control={control} members={members} roles={roles} roleId={roleId} /> : null}
      </ScrollView>
      <EditorFooter
        notice={mutationNotice(save, accessRefusal(save.error) ?? failureMessage("Couldn't save the role. Try again."))}
        mutation={save}
        dirty={isDirty}
        saveable={roleId === undefined || isDirty}
        onSave={submit}
        onDiscard={wideActions?.onDiscard}
        onDeleteRole={wideActions?.onDelete}
      />
    </KeyboardAvoidingView>
  );
}

function GeneralFields({ control }: { control: Control<RoleValues> }) {
  return (
    <FieldGrid>
      <ControlledText control={control} name="role_name" label="Role Name" required span="full" maxLength={60} />
      <ControlledText control={control} name="description" label="Description" hint="What this role is for" span="full" multiline maxLength={200} />
      <ColorField control={control} />
    </FieldGrid>
  );
}

function RolePermissions({ control, catalog }: { control: Control<RoleValues>; catalog: Permission[] }) {
  const { field } = useController({ control, name: 'permissions' });

  return (
    <PermissionSwitches
      catalog={catalog}
      value={field.value}
      onChange={(next) => {
        field.onChange(next);
        field.onBlur();
      }}
    />
  );
}

/** Who holds the role. One role each, so checking someone moves them here from theirs. */
function RoleMembers({ control, members, roles, roleId }: { control: Control<RoleValues>; members: Member[]; roles: RoleWithGrants[]; roleId?: string }) {
  const roleName = (id: string | null) => roles.find((role) => role.id === id)?.role_name ?? 'No role';

  return (
    <ControlledChecklist
      control={control}
      name="member_ids"
      label="Employees in this role"
      hint="One role each: checking someone moves them here"
      options={members.map((member) => ({
        value: member.id,
        label: memberName(member),
        hint: member.role_id === (roleId ?? null) ? (member.email ?? undefined) : `Currently: ${roleName(member.role_id)}`,
      }))}
    />
  );
}

/** The role's colour: a swatch per palette key, the picked one ringed. */
function ColorField({ control }: { control: Control<RoleValues> }) {
  const { colors } = useAppTheme();
  const roleColor = useRoleColor();
  const { field } = useController({ control, name: 'color' });

  return (
    <Field label="Colour" span="full">
      <View style={styles.swatches}>
        {ROLE_COLORS.map((color) => (
          <Pressable
            key={color}
            onPress={() => field.onChange(color)}
            // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
            android_ripple={{ color: colors.ripple, borderless: true }}
            accessibilityRole="radio"
            accessibilityState={{ checked: field.value === color }}
            accessibilityLabel={color}
            style={[styles.swatch, { borderColor: field.value === color ? colors.onSurface : 'transparent' }]}
          >
            <View style={[styles.fillSwatch, { backgroundColor: roleColor(color) }]} />
          </Pressable>
        ))}
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { gap: spacing.md, padding: spacing.md, width: '100%', maxWidth: 720 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Sizes, not spacing: a swatch is a control, and its 48dp is the touch target (.claude/instruction_mds/frontend.md rule 19).
  swatch: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  fillSwatch: { width: 36, height: 36, borderRadius: 18 },
});
