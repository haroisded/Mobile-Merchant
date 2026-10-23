import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useConfirm } from '../../components/confirm-dialog';
import { RecordList, StatusText } from '../../components/record-list';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import { formatCode } from '../../features/access-codes/code';
import { memberName, useDeleteMemberMutation, useOwnedMembersQuery } from '../../features/members/queries';
import type { OwnedMember } from '../../features/members/queries';
import { usePosProfileUsersQuery } from '../../features/pos-profiles/queries';
import { useShellWide } from '../../lib/columns';
import { displayDateTime } from '../../lib/dates';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';

/** "via A4F-7K2" — the code they joined with. */
const via = (member: OwnedMember) => (member.access_code ? `via ${formatCode(member.access_code)}` : '');

/** Everyone let into the owner's stores, newest first. A row asks to revoke. */
export function Members() {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const members = useOwnedMembersQuery();
  const profileUsers = usePosProfileUsersQuery().data ?? [];
  const revoke = useDeleteMemberMutation();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');

  const needle = search.trim().toLowerCase();
  const found = members.data?.filter((member) =>
    [member.full_name ?? '', member.email ?? '', member.merchants.name].some((text) => text.toLowerCase().includes(needle))
  );

  // A POS Profile with nobody listed is anyone's, so revoking its only user opens it to every member.
  const onlyUserOf = (member: OwnedMember) =>
    profileUsers
      .filter((row) => row.member_id === member.id && profileUsers.filter((other) => other.pos_profile_id === row.pos_profile_id).length === 1)
      .map((row) => row.pos_profiles?.pos_profile_name ?? 'a POS Profile');

  // What a row does, said on it: revoking is destructive, so `error` (.claude/instruction_mds/frontend.md rule 9).
  const revokeWord = (
    <Text variant="labelMedium" style={{ color: colors.error }}>
      Revoke
    </Text>
  );

  const askRevoke = (member: OwnedMember) => {
    const opened = onlyUserOf(member);
    confirm.ask({
      kicker: 'Revoke',
      title: `Revoke ${memberName(member)}?`,
      body: [
        `They lose ${member.merchants.name} at once and are told so. To come back they need a new code.`,
        opened.length > 0 ? `They're the only user of ${opened.join(', ')}: without them, anyone in the store can use ${opened.length === 1 ? 'it' : 'those'}.` : null,
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: 'Revoke',
      run: () => revoke.mutateAsync(member.id),
      failure: () => failureMessage("Couldn't revoke their access. Try again."),
      // Wide, useConfirm closes its Dialog; narrow, the confirm is a sheet over this tab.
      onDone: () => {
        if (!wide) router.back();
      },
    });
  };

  return (
    <View style={styles.fill}>
      <View style={styles.toolbar}>
        <TextInput
          mode="outlined"
          dense
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, email or store"
          accessibilityLabel="Search members"
          left={<TextInput.Icon icon="search" />}
        />
      </View>
      <RecordList
        underTabs
        query={{ ...members, data: found }}
        keyOf={(member) => member.id}
        columns={[
          { label: 'Name', flex: 2, cell: memberName },
          { label: 'Email', flex: 2.5, cell: (member) => member.email ?? '' },
          { label: 'Store', flex: 2, cell: (member) => member.merchants.name },
          { label: 'Code', flex: 1.2, cell: (member) => (member.access_code ? formatCode(member.access_code) : '') },
          { label: 'Joined', flex: 1.6, cell: (member) => displayDateTime(member.created_at) },
          { label: '', flex: 1, cell: () => '', node: () => revokeWord },
        ]}
        title={memberName}
        subtitle={(member) => [member.full_name ? member.email : null, member.merchants.name, via(member)].filter(Boolean).join(' · ')}
        status={(member) => (
          <>
            <StatusText words={[`Joined ${displayDateTime(member.created_at)}`]} />
            {revokeWord}
          </>
        )}
        accessibilityLabel={(member) => `${memberName(member)}, ${member.merchants.name}. Revoke`}
        onPress={askRevoke}
        empty={needle ? 'Nobody matches that search.' : 'Nobody has joined yet. Approve a request, and the person shows up here.'}
        offline="You're offline. Members will load when you reconnect."
        failure="Couldn't load members. Try again."
      />
      {confirm.dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  toolbar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.ms },
});
