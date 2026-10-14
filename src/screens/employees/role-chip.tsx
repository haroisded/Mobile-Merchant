import { StyleSheet, View } from 'react-native';

import { Text } from '../../components/text';
import type { RoleColor } from '../../features/roles/schema';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

// The palette's theme keys (src/themes.js), one per roles_color value.
const KEYS = {
  grey: 'roleGrey',
  slate: 'roleSlate',
  red: 'roleRed',
  maroon: 'roleMaroon',
  orange: 'roleOrange',
  amber: 'roleAmber',
  green: 'roleGreen',
  teal: 'roleTeal',
  cyan: 'roleCyan',
  blue: 'roleBlue',
  indigo: 'roleIndigo',
  purple: 'rolePurple',
  pink: 'rolePink',
} as const satisfies Record<RoleColor, string>;

/** A role's colour from the theme. */
export function useRoleColor() {
  const { colors } = useAppTheme();
  // SAFETY: roles_color holds every role's colour to the palette's keys, so the cast names one of them.
  return (color: string) => colors[KEYS[color as RoleColor]];
}

/** The dot beside a role's name: its colour, never its name's. */
export function RoleDot({ color }: { color: string }) {
  const roleColor = useRoleColor();
  return <View style={[styles.dot, { backgroundColor: roleColor(color) }]} />;
}

/** A role as a pill — its dot and name — or "No role", faint. */
export function RoleChip({ role }: { role: { role_name: string; color: string } | undefined }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.chip, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceMuted }]}>
      {role ? <RoleDot color={role.color} /> : null}
      <Text variant="labelLarge" numberOfLines={1} style={[styles.name, role ? null : { color: colors.onSurfaceFaint }]}>
        {role?.role_name ?? 'No role'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // A size, not spacing: the dot is a control's mark (.claude/instruction_mds/frontend.md §4.3).
  dot: { width: 10, height: 10, borderRadius: 5 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.ms,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
  },
  name: { flexShrink: 1 },
});
