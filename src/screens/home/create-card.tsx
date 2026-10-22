import { StyleSheet, View } from 'react-native';

import { Avatar } from '../../components/avatar';
import { Card } from '../../components/card';
import { useAppTheme } from '../../lib/theme';
import { radius } from '../../themes';
import { CardTitle, StoreTile } from './system-card';

/**
 * Create New Store, the stores list's first card at every width. Drawn from the store card's own parts — the 16:9 tile
 * and the 72dp name row on a tablet, the name row alone on a phone — so it is exactly a store card's size. A dashed
 * outline on `surfaceMuted` marks it a slot to fill rather than a store; the outline is laid over the card, not
 * around it, so it adds no size.
 */
export function CreateCard({ row, onPress }: { row: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  // The slot's icon circle is accent (.claude/instruction_mds/frontend.md §2.3): 48 on the tile, Card.Title's 40 in a row.
  const plus = (size: number) => <Avatar.Icon icon="add" size={size} color={colors.onAccent} style={{ backgroundColor: colors.accent }} />;

  return (
    <Card mode="contained" onPress={onPress} style={{ backgroundColor: colors.surfaceMuted }} accessibilityLabel="Create New Store">
      {row ? null : (
        <StoreTile>{plus(48)}</StoreTile>
      )}
      <CardTitle title="Create New Store" row={row} avatar={plus(40)} />
      <View pointerEvents="none" style={[styles.outline, { borderColor: colors.outlineVariant }]} />
    </Card>
  );
}

const styles = StyleSheet.create({
  outline: { ...StyleSheet.absoluteFill, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, borderCurve: 'continuous' },
});
