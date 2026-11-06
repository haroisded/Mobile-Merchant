import { StyleSheet, View } from 'react-native';

import { Avatar } from '../../components/avatar';
import { Card } from '../../components/card';
import { useAppTheme } from '../../lib/theme';
import { radius } from '../../themes';
import { CardTitle, StoreTile } from './system-card';

/**
 * Create New Store, the stores list's first card at every width. Drawn from the store card's own parts — the 16:9 tile
 * and the 72dp name row — so it is exactly a store card's size. A dashed outline on `surfaceMuted` marks it a slot to
 * fill rather than a store; the outline is laid over the card, not around it, so it adds no size.
 */
export function CreateCard({ onPress }: { onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Card mode="contained" onPress={onPress} style={{ backgroundColor: colors.surfaceMuted }} accessibilityLabel="Create New Store">
      <StoreTile>
        {/* The slot's icon circle is accent (.claude/instruction_mds/frontend.md §2.3). */}
        <Avatar.Icon icon="add" size={48} color={colors.onAccent} style={{ backgroundColor: colors.accent }} />
      </StoreTile>
      <CardTitle title="Create New Store" />
      <View pointerEvents="none" style={[styles.outline, { borderColor: colors.outlineVariant }]} />
    </Card>
  );
}

const styles = StyleSheet.create({
  outline: { ...StyleSheet.absoluteFill, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, borderCurve: 'continuous' },
});
