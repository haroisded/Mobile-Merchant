import { Pressable, StyleSheet, View } from 'react-native';

import type { IconName } from '../lib/icons';
import { useAppTheme } from '../lib/theme';
import { spacing } from '../themes';
import { Avatar } from './avatar';
import { Icon } from './icon';
import { Text } from './text';

// The store shell's rail and drawer rows: the real shell (src/app/(app)/systems/[id]/_layout.tsx) and the Store
// Guide's practice store (src/screens/guide/sandbox/) draw the same rows, so a guide never looks unlike the app.

/** "Cafe 67" → "C6": the first letter of up to two words, for the store badge. */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

type BadgeProps = { name: string; /** Under the name, when given. */ line?: string; wide: boolean; labelled: boolean };

/** The top of the rail or drawer: the store's initials and name, then the rule above the destinations. */
export function StoreBadge({ name, line, wide, labelled }: BadgeProps) {
  const { colors } = useAppTheme();

  return (
    <>
      <View style={wide ? styles.storeRail : styles.storeDrawer}>
        <Avatar.Text size={40} label={initials(name)} color={colors.primary} style={{ backgroundColor: colors.onPrimary }} />
        {labelled ? (
          <View style={styles.storeText}>
            <Text variant="titleMedium" numberOfLines={1} style={{ color: colors.onPrimary }}>
              {name}
            </Text>
            {line ? (
              <Text variant="bodySmall" style={[styles.subtitle, { color: colors.onPrimary }]}>
                {line}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={[styles.divider, { backgroundColor: colors.onPrimary }]} />
    </>
  );
}

type ItemProps = {
  label: string;
  icon: IconName;
  wide: boolean;
  labelled: boolean;
  active?: boolean;
  /** A row that opens a dropdown (the shell's Setup and Stock): whether it is open. */
  open?: boolean;
  onPress: () => void;
};

// One rail or drawer row. Active: the lightened ground and the 4px accent bar. Inactive: no ground, no
// bar, 68%. The bar is a left border on every item, transparent when inactive, so selecting an item
// never shifts its content sideways (.claude/instruction_mds/frontend.md §5).
export function NavItem({ label, icon, wide, labelled, active, open, onPress }: ItemProps) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      // The drawer router closes the front drawer on any route change (DrawerRouter.js:114-119), so
      // tapping a destination needs no separate close call.
      onPress={onPress}
      // On `primary` the press colour is the same lightened ground the active item wears.
      android_ripple={{ color: colors.primaryHighlight }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, expanded: open }}
      style={[
        styles.item,
        active ? { backgroundColor: colors.primaryHighlight, borderLeftColor: colors.accent } : styles.inactive,
      ]}
    >
      <View style={wide ? styles.railItem : styles.drawerItem}>
        <Icon source={icon} size={wide ? 24 : 22} color={colors.onPrimary} />
        {labelled ? (
          <View style={styles.labelRow}>
            <Text
              variant="labelLarge"
              numberOfLines={1}
              style={[styles.fill, { color: colors.onPrimary }]}
            >
              {label}
            </Text>
            {open === undefined ? null : <Icon source={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.onPrimary} />}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A section under an open dropdown: the name in full, indented under its row, and the same active ground and bar. */
export function NavSubItem({ label, icon, active, onPress }: { label: string; icon?: IconName; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.primaryHighlight }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[styles.item, active ? { backgroundColor: colors.primaryHighlight, borderLeftColor: colors.accent } : styles.inactive]}
    >
      <View style={styles.subItem}>
        {icon ? <Icon source={icon} size={20} color={colors.onPrimary} /> : null}
        <Text variant="labelLarge" style={[styles.subLabel, { color: colors.onPrimary }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  storeRail: { alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md },
  storeDrawer: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, padding: spacing.md },
  storeText: { flexShrink: 1 },
  subtitle: { opacity: 0.7 },
  divider: { height: 1, opacity: 0.28 },
  // 4 of border plus `ms` of padding puts every icon `md` from the edge, level with the badge above.
  item: { borderLeftWidth: 4, borderLeftColor: 'transparent' },
  inactive: { opacity: 0.68 },
  // Stretch, not flex-start: the label row under the icon needs the rail's width, or its flex: 1
  // label measures to nothing and the rail shows icons only.
  railItem: { alignItems: 'stretch', gap: spacing.sm, paddingVertical: spacing.ms, paddingLeft: spacing.ms, paddingRight: spacing.ms },
  // flexGrow, not flex: 1 — under the rail's icon the item is a column, where flex: 1's zero basis
  // made the row zero tall and hid every label.
  labelRow: { flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexShrink: 1, minWidth: 0 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingLeft: spacing.ms, paddingRight: spacing.md },
  // minHeight: a row still a touch target when its name is short. Indented one step past the row above.
  subItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, minHeight: 48, paddingVertical: spacing.sm, paddingLeft: spacing.xl, paddingRight: spacing.md },
  subLabel: { flexShrink: 1 },
});
