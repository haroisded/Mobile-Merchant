import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '../../components/avatar';
import { Text } from '../../components/text';
import type { IconName } from '../../lib/icons';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

type Props = { icon: IconName; title: string; line: string; onPress: () => void };

/**
 * The first cells of the wide systems grid: what the Create New System and Enter Access Code buttons are on a
 * phone. Always there, with or without systems, so Create doubles as the empty state.
 *
 * A Pressable, not a Card: a dashed outline marks a slot to fill rather than a thing that exists.
 * `flexGrow` lets FlashList's row normalisation (GridLayoutManager.ts:144) stretch it to the system cards
 * beside it, since it has no picture of its own to set its height.
 */
export function SlotCard({ icon, title, line, onPress }: Props) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
      android_ripple={{ color: colors.ripple }}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[styles.card, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceMuted }]}
    >
      <Avatar.Icon icon={icon} size={48} color={colors.onAccent} style={{ backgroundColor: colors.accent }} />
      {/* Centred, like the + above it: the card is a single target, not a column of reading
          (.claude/instruction_mds/frontend.md rule 18). */}
      <View style={styles.copy}>
        <Text variant="titleMedium" style={styles.centred}>
          {title}
        </Text>
        <Text variant="bodySmall" style={[styles.centred, { color: colors.onSurfaceMuted }]}>
          {line}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.ms,
    padding: spacing.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    // The ripple stays inside the rounded corners.
    overflow: 'hidden',
  },
  copy: { gap: spacing.xs },
  centred: { textAlign: 'center' },
});
