import { Pressable, StyleSheet, View } from 'react-native';

import { AdaptiveDialog } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { Icon } from '../../components/icon';
import { Text } from '../../components/text';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';
import { ROLE_GROUPS } from './roles';
import type { Role } from './roles';

/** A role's tag: what kind of role it is, as the sheet's Type column says. */
const kindTag = (role: Role) => (role.owner ? 'OWNER' : role.kind === 'No role' ? 'NO ROLE' : role.kind === 'Built-in' ? 'BUILT-IN' : 'CUSTOM');

/** "2 permissions", or the owner's "Every permission". */
const permissionCount = (role: Role) => (role.owner ? 'Every permission' : `${role.permissions.length} ${role.permissions.length === 1 ? 'permission' : 'permissions'}`);

/**
 * The Store Guide's role list (.claude/instruction-mds/frontend.md §5, Store Guide): the sheet's roles by work area,
 * each group a heading over a 1px box of rows — name, kind tag, how many permissions and what the role does. Popped up
 * as a native formSheet on a phone (sheets/guide-roles) and a Dialog over the Guide page on a tablet.
 */
export function RoleListDialog({ inSheet, onPick, onDismiss }: { inSheet?: boolean; onPick: (role: Role) => void; onDismiss: () => void }) {
  const { colors } = useAppTheme();

  return (
    <AdaptiveDialog inSheet={inSheet} kicker="Store Guide" title="Pick a role to practise" onDismiss={onDismiss} actions={<Button onPress={onDismiss}>Close</Button>}>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
        Each role is a set of the 20 permissions an owner turns on in Employees. Pick one to try its work in a practice store.
      </Text>
      {ROLE_GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <View>
            <Text variant="labelMedium" style={{ color: colors.secondary }}>
              {group.title}
            </Text>
            <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
              {group.hint}
            </Text>
          </View>
          <View style={[styles.box, { borderColor: colors.outlineVariant }]}>
            {group.roles.map((role, index) => (
              <Pressable
                key={role.id}
                onPress={() => onPick(role)}
                android_ripple={{ color: colors.ripple }}
                accessibilityRole="button"
                accessibilityLabel={`${role.name}, ${permissionCount(role)}`}
                style={[styles.row, index === 0 ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant }]}
              >
                <View style={styles.text}>
                  <View style={styles.titleRow}>
                    <Text variant="titleMedium" style={styles.shrink}>
                      {role.name}
                    </Text>
                    <View style={[styles.tag, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceMuted }]}>
                      <Text variant="labelMedium">{kindTag(role)}</Text>
                    </View>
                  </View>
                  <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                    {`${permissionCount(role)} · ${role.responsibilities}`}
                  </Text>
                </View>
                <Icon source="chevron-right" size={22} color={colors.onSurfaceMuted} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, padding: spacing.ms, minHeight: 56 },
  text: { flex: 1, gap: spacing.xs },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  shrink: { flexShrink: 1 },
  // The type badge (frontend.md §5, Lists): a 1px outlineVariant border on surfaceMuted.
  tag: { borderWidth: 1, borderRadius: radius.sm, borderCurve: 'continuous', paddingHorizontal: spacing.xs },
});
