import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AdaptiveDialog } from '../../components/adaptive-dialog';
import { ProgressBar } from '../../components/progress-bar';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';
import { PERMISSIONS, rolesMatching } from './roles';
import type { Role } from './roles';

/** A role's tag: what kind of role it is, as the sheet's Type column says. */
const kindTag = (role: Role) => (role.owner ? 'Owner' : role.kind);

/** "2 of 20 permissions" — the owner holds all 20, and more besides. */
const permissionCount = (role: Role) => `${role.permissions.length} of ${PERMISSIONS.length} permissions`;

/**
 * The Store Guide's role list (.claude/instruction-mds/frontend.md §5, Store Guide): a search box, then the sheet's
 * roles by work area — each a card with its kind tag, what it does, and a bar of how many of the 20 permissions it
 * holds. Popped up as a native formSheet on a phone (sheets/guide-roles) and a Dialog over the Guide page on a tablet;
 * the X at the top right closes it. The search box stays put and the cards scroll under it (AdaptiveDialog
 * `scroll={false}`, the picker's shape), so a filtered sheet keeps its height above the keyboard.
 */
export function RoleListDialog({ inSheet, onPick, onDismiss }: { inSheet?: boolean; onPick: (role: Role) => void; onDismiss: () => void }) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const groups = rolesMatching(query);

  return (
    <AdaptiveDialog inSheet={inSheet} kicker="Store Guide" title="Pick a role to practise" onDismiss={onDismiss} onClose={onDismiss} scroll={false}>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
        Each role is a set of the 20 permissions an owner turns on in Employees. Pick one to try its work in a practice store.
      </Text>
      <TextInput
        mode="outlined"
        dense
        value={query}
        onChangeText={setQuery}
        placeholder="Search roles"
        accessibilityLabel="Search roles"
        left={<TextInput.Icon icon="search" />}
      />
      <ScrollView style={styles.list} contentContainerStyle={styles.groups} keyboardShouldPersistTaps="handled">
        {groups.length === 0 ? (
          <View style={[styles.empty, { borderColor: colors.outlineVariant }]}>
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceMuted }}>
              No role matches.
            </Text>
          </View>
        ) : null}
        {groups.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text variant="labelMedium" style={{ color: colors.secondary }}>
              {group.title}
            </Text>
            {group.roles.map((role) => (
              <Pressable
                key={role.id}
                onPress={() => onPick(role)}
                android_ripple={{ color: colors.ripple }}
                accessibilityRole="button"
                accessibilityLabel={`${role.name}, ${kindTag(role)}. ${role.responsibilities}. ${permissionCount(role)}`}
                style={[styles.card, { borderColor: colors.outlineVariant }]}
              >
                <View style={styles.titleRow}>
                  <Text variant="titleMedium" style={styles.shrink}>
                    {role.name}
                  </Text>
                  <View style={[styles.tag, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceMuted }]}>
                    <Text variant="labelMedium">{kindTag(role)}</Text>
                  </View>
                </View>
                <Text variant="bodyMedium" style={{ color: colors.onSurfaceMuted }}>
                  {role.responsibilities}
                </Text>
                <View style={styles.countRow}>
                  <View style={styles.bar}>
                    <ProgressBar
                      progress={role.permissions.length / PERMISSIONS.length}
                      color={colors.accent}
                      style={[styles.track, { backgroundColor: colors.surfaceVariant }]}
                    />
                  </View>
                  <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                    {permissionCount(role)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  // Shrinks to what the Dialog or sheet leaves under the search box, and scrolls inside it.
  list: { flexShrink: 1 },
  groups: { gap: spacing.md, paddingBottom: spacing.sm },
  group: { gap: spacing.sm },
  card: {
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingHorizontal: spacing.ms,
    paddingVertical: spacing.ms,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  shrink: { flex: 1 },
  // The type badge (frontend.md §5, Lists): a 1px outlineVariant border on surfaceMuted.
  tag: { borderWidth: 1, borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: spacing.sm },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, paddingTop: spacing.xs },
  bar: { flex: 1 },
  track: { height: 4, borderRadius: radius.sm },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg },
});
