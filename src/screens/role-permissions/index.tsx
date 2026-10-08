import { router } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { saveOnce } from '../../components/adaptive-dialog';
import { Checkbox } from '../../components/checkbox';
import { PageForm } from '../../components/form-footer';
import { IconButton } from '../../components/icon-button';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { SearchSelect } from '../../components/search-select';
import { Text } from '../../components/text';
import { useDoctypesQuery } from '../../features/doctypes/queries';
import type { Doctype } from '../../features/doctypes/queries';
import { can, usePermissions, useRolePermissionsQuery, useSaveRolePermissionsMutation } from '../../features/role-permissions/queries';
import type { RolePermission, RulesValues } from '../../features/role-permissions/queries';
import { useRolesQuery } from '../../features/roles/queries';
import type { Role } from '../../features/roles/queries';
import { failureMessage, mutationNotice } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

type Flag = 'can_select' | 'can_read' | 'can_write' | 'can_create' | 'can_delete';

// ERPNext's permission columns, in its order. A single doctype (Company, a Settings page) has one row per
// system, so only Read and Write mean anything there.
const FLAGS: { flag: Flag; label: string; single: boolean }[] = [
  { flag: 'can_select', label: 'Select', single: false },
  { flag: 'can_read', label: 'Read', single: true },
  { flag: 'can_write', label: 'Write', single: true },
  { flag: 'can_create', label: 'Create', single: false },
  { flag: 'can_delete', label: 'Delete', single: false },
];

/**
 * The Role Permissions Manager (docs.frappe.io/erpnext/role-based-permissions): pick a document type, then
 * set what each role may do with it. RLS enforces exactly these rules (private.permitted_merchant_ids).
 */
export function RolePermissions({ merchantId }: { merchantId: string }) {
  const doctypes = useDoctypesQuery();
  const [doctypeName, setDoctypeName] = useState('Company');
  const doctype = doctypes.data?.find((candidate) => candidate.name === doctypeName);

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Setup" title="Role Permissions Manager" meta="What each role may do, document type by document type" onBack={() => router.back()} />
      {doctypes.data && doctype ? (
        <Rules
          // A new document type is a new form: its rules start from what is saved.
          key={doctype.name}
          merchantId={merchantId}
          doctype={doctype}
          doctypes={doctypes.data}
          onDoctype={setDoctypeName}
        />
      ) : (
        <View style={styles.state}>
          <QueryState query={doctypes} offline="You're offline. Permissions will load when you reconnect." failure="Couldn't load the document types. Try again." />
        </View>
      )}
    </View>
  );
}

type RulesProps = { merchantId: string; doctype: Doctype; doctypes: Doctype[]; onDoctype: (name: string) => void };

function Rules({ merchantId, doctype, doctypes, onDoctype }: RulesProps) {
  const rules = useRolePermissionsQuery({ merchantId, doctype: doctype.name });
  const roles = useRolesQuery({ merchantId });

  const picker = (
    <SearchSelect
      label="Document Type"
      title="Document Type"
      span="full"
      value={doctype.name}
      onChange={onDoctype}
      options={doctypes.map((candidate) => ({ value: candidate.name, label: candidate.name }))}
    />
  );

  if (!rules.data || !roles.data) {
    return (
      <View style={styles.state}>
        {picker}
        <QueryState
          query={rules.data ? roles : rules}
          offline="You're offline. Permissions will load when you reconnect."
          failure="Couldn't load the permissions. Try again."
        />
      </View>
    );
  }

  return <RulesForm merchantId={merchantId} doctype={doctype} picker={picker} saved={rules.data} roles={roles.data} />;
}

type FormProps = { merchantId: string; doctype: Doctype; picker: ReactNode; saved: RolePermission[]; roles: Role[] };

function RulesForm({ merchantId, doctype, picker, saved, roles }: FormProps) {
  const editable = can(usePermissions({ merchantId }).data, 'Role Permission', 'write');
  const save = useSaveRolePermissionsMutation({ merchantId, doctype: doctype.name });
  const notice = mutationNotice(save, failureMessage("Couldn't save these permissions. Try again."));
  const roleName = (id: string) => roles.find((role) => role.id === id)?.role_name ?? '';
  const single = doctype.kind === 'single';

  const { control, handleSubmit, reset, formState } = useForm<RulesValues>({
    defaultValues: {
      rules: saved
        .map(({ role_id, can_select, can_read, can_write, can_create, can_delete }) => ({ role_id, can_select, can_read, can_write, can_create, can_delete }))
        .sort((a, b) => roleName(a.role_id).localeCompare(roleName(b.role_id))),
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'rules' });
  const unruled = roles.filter((role) => !fields.some((field) => field.role_id === role.id));

  const submit = handleSubmit(saveOnce(save, reset));

  return (
    <PageForm editable={editable} readOnly="Changing these rules needs Role Permission write." notice={notice} mutation={save} dirty={formState.isDirty} onSave={submit}>
        {picker}
        {fields.length === 0 ? <Text variant="bodyMedium">No role may use {doctype.name} yet. Add a rule below.</Text> : null}
        {fields.map((field, index) => (
          <RuleRow
            key={field.id}
            control={control}
            index={index}
            roleName={roleName(field.role_id)}
            single={single}
            editable={editable}
            onRemove={() => remove(index)}
          />
        ))}
        {editable && unruled.length > 0 ? (
          <SearchSelect
            label="Add a New Rule"
            hint="Choose a role; it starts with Read"
            title="Add a rule for"
            span="full"
            value=""
            onChange={(roleId) =>
              append({ role_id: roleId, can_select: false, can_read: true, can_write: false, can_create: false, can_delete: false })
            }
            options={unruled.map((role) => ({ value: role.id, label: role.role_name }))}
          />
        ) : null}
    </PageForm>
  );
}

type RowProps = { control: Control<RulesValues>; index: number; roleName: string; single: boolean; editable: boolean; onRemove: () => void };

/** One role's rule: its name, a remove action, and a checkbox per permission. */
function RuleRow({ control, index, roleName, single, editable, onRemove }: RowProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.rule, { borderColor: colors.outlineVariant }]}>
      <View style={styles.ruleHead}>
        <Text variant="titleMedium" style={styles.fill}>
          {roleName}
        </Text>
        {editable ? <IconButton icon="close" onPress={onRemove} accessibilityLabel={`Remove the rule for ${roleName}`} style={styles.remove} /> : null}
      </View>
      <View style={styles.flags}>
        {FLAGS.filter((column) => column.single || !single).map((column) => (
          <Controller
            key={column.flag}
            control={control}
            name={`rules.${index}.${column.flag}`}
            render={({ field }) => (
              <Pressable
                onPress={() => field.onChange(!field.value)}
                disabled={!editable}
                // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
                android_ripple={{ color: colors.ripple }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: field.value, disabled: !editable }}
                accessibilityLabel={`${roleName}: ${column.label}`}
                style={styles.flag}
              >
                <Checkbox.Android
                  status={field.value ? 'checked' : 'unchecked'}
                  disabled={!editable}
                  color={colors.accent}
                  onPress={() => field.onChange(!field.value)}
                />
                <Text variant="bodyMedium">{column.label}</Text>
              </Pressable>
            )}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'stretch', padding: spacing.md },
  rule: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.sm, gap: spacing.xs },
  ruleHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.sm },
  // IconButton ships a margin of its own; the row's gap is the spacing.
  remove: { margin: 0 },
  flags: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm },
  // 48: the Android touch target floor (.claude/instruction_mds/frontend.md rule 19).
  flag: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingRight: spacing.sm },
});
