import { Pressable, StyleSheet, View } from 'react-native';

import { useShellWide } from '../lib/columns';
import type { IconName } from '../lib/icons';
import { useAppTheme } from '../lib/theme';
import { radius, spacing } from '../themes';
import { Icon } from './icon';
import { Text } from './text';

/** An icon on its tonal square: a tile's, a section's head, a search result's. */
export function TonalIcon({ icon, large = false }: { icon?: IconName; large?: boolean }) {
  const { colors } = useAppTheme();

  return (
    <View style={[large ? styles.tonalLarge : styles.tonal, { backgroundColor: colors.primaryContainer }]}>
      {icon ? <Icon source={icon} size={large ? 24 : 20} color={colors.onPrimaryContainer} /> : null}
    </View>
  );
}

type Props = { icon?: IconName; title: string; line: string; onPress: () => void };

/**
 * A page to open, in a useColumns grid: Setup's and Stock's pages, Home's shortcuts. An outlined box, its icon over its
 * name and line when wide, beside them narrow.
 */
export function IconTile({ icon, title, line, onPress }: Props) {
  const { colors } = useAppTheme();
  const wide = useShellWide();

  return (
    <Pressable
      onPress={onPress}
      // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
      android_ripple={{ color: colors.ripple }}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[styles.tile, wide ? null : styles.tileRow, { borderColor: colors.outlineVariant, backgroundColor: colors.surface }]}
    >
      <TonalIcon icon={icon} />
      <View style={styles.text}>
        <Text variant="titleMedium">{title}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {line}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The squares are sizes, not spacing.
  tonal: { width: 36, height: 36, borderRadius: radius.button, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  tonalLarge: { width: 48, height: 48, borderRadius: radius.xl, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  // flexGrow: the tiles of a row stand as tall as the tallest.
  tile: { flexGrow: 1, gap: spacing.ms, padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  tileRow: { flexDirection: 'row', alignItems: 'center' },
  text: { flexShrink: 1, gap: spacing.xs },
});
