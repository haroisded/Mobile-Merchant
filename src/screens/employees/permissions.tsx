import { router } from 'expo-router';
import { useState } from 'react';
import { useForm, useFormState } from 'react-hook-form';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import { memberName } from '../../features/members/queries';
import type { Merchant } from '../../features/merchants/queries';
import { useBottomInset, useShellWide } from '../../lib/columns';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';
import { AccessEditor, accessValues } from './editor/access-editor';
import type { AccessValues } from './editor/access-editor';
import { EmployeePage } from './employee';
import { OwnerOnly } from './index';
import { RoleChip } from './role-chip';
import { useEmployees } from './use-employees';
import type { EmployeesData } from './use-employees';
import { useDiscard } from '../../components/use-discard';

/**
 * Permissions: the employees, and the open one's permissions — beside them wide, as the Permissions mock draws it;
 * narrow, a phone's, on a page of their own the list opens.
 */
export function PermissionsScreen({ merchant, isOwner, memberId }: { merchant: Merchant; isOwner: boolean; memberId?: string }) {
  const wide = useShellWide();
  const employees = useEmployees(merchant.id);

  if (!wide && memberId) return <EmployeePage merchant={merchant} isOwner={isOwner} memberId={memberId} />;
  if (!isOwner) return <OwnerOnly title="Permissions" />;

  const openPage = (id: string) => router.push({ pathname: '/systems/[id]/employees/employee', params: { id: merchant.id, memberId: id } });

  return (
    <View style={styles.fill}>
      <PageHeader kicker={merchant.name} title="Permissions" meta="Each employee's role, and their own exceptions to it" onBack={() => router.back()} />
      {employees.data ? (
        wide ? (
          <AccessPanes data={employees.data} initial={memberId} />
        ) : (
          <MemberList data={employees.data} onOpen={openPage} />
        )
      ) : (
        <View style={styles.state}>
          <QueryState query={employees} offline="You're offline. Permissions will load when you reconnect." failure="Couldn't load permissions. Try again." />
        </View>
      )}
    </View>
  );
}

function AccessPanes({ data, initial }: { data: EmployeesData; initial?: string }) {
  const { colors } = useAppTheme();
  const [selected, setSelected] = useState(initial ?? data.members[0]?.id);
  const member = data.members.find((candidate) => candidate.id === selected);
  const form = useForm<AccessValues>({ defaultValues: member ? accessValues(member, data.roles, data.catalog) : { role_id: '', permissions: [] } });
  // Subscribed during render, as RolePanes' is: read only inside `choose`, `form.formState` is the last render's.
  const { isDirty } = useFormState({ control: form.control });
  const discard = useDiscard();

  const choose = (memberId: string) =>
    discard.ask(isDirty, () => {
      setSelected(memberId);
      const next = data.members.find((candidate) => candidate.id === memberId);
      if (next) form.reset(accessValues(next, data.roles, data.catalog));
    });

  return (
    <View style={styles.panes}>
      <View style={[styles.listPane, { borderRightColor: colors.outlineVariant }]}>
        <MemberList data={data} selected={selected} onOpen={choose} />
      </View>
      <View style={styles.editorPane}>
        {member ? (
          <AccessEditor member={member} roles={data.roles} catalog={data.catalog} form={form} onDiscard={() => form.reset()} />
        ) : (
          <Text variant="bodyMedium" style={styles.state}>
            Pick someone on the left to see what they may do.
          </Text>
        )}
      </View>
      {discard.dialog}
    </View>
  );
}

/** The employees, searched, each with their role: the left pane wide, the whole page narrow. */
function MemberList({ data, selected, onOpen }: { data: EmployeesData; selected?: string; onOpen: (memberId: string) => void }) {
  const { colors } = useAppTheme();
  const [search, setSearch] = useState('');
  const roleOf = (roleId: string | null) => data.roles.find((role) => role.id === roleId);
  const bottom = useBottomInset();
  const needle = search.trim().toLowerCase();
  const found = data.members.filter((candidate) => `${candidate.full_name ?? ''} ${candidate.email ?? ''}`.toLowerCase().includes(needle));

  return (
    <>
      <View style={styles.paneTop}>
        <TextInput
          mode="outlined"
          dense
          value={search}
          onChangeText={setSearch}
          placeholder="Search employees"
          accessibilityLabel="Search employees"
          left={<TextInput.Icon icon="search" />}
        />
      </View>
      <FlatList
        data={found}
        keyExtractor={(candidate) => candidate.id}
        contentContainerStyle={{ paddingBottom: bottom }}
        ListEmptyComponent={
          <Text variant="bodyMedium" style={styles.state}>
            {needle ? 'Nobody matches.' : 'Nobody has joined yet.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpen(item.id)}
            // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
            android_ripple={{ color: colors.ripple }}
            accessibilityRole="button"
            accessibilityLabel={`${memberName(item)}, ${roleOf(item.role_id)?.role_name ?? 'no role'}`}
            accessibilityState={{ selected: item.id === selected }}
            style={[styles.row, { borderBottomColor: colors.surfaceVariant }, item.id === selected ? { backgroundColor: colors.surfaceMuted } : null]}
          >
            <Text variant="titleMedium">{memberName(item)}</Text>
            <RoleChip role={roleOf(item.role_id)} />
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  panes: { flex: 1, flexDirection: 'row' },
  // The list beside the editor: two parts in five of the pane.
  listPane: { flex: 2, borderRightWidth: 1 },
  editorPane: { flex: 3 },
  paneTop: { padding: spacing.md },
  row: { gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1 },
});
