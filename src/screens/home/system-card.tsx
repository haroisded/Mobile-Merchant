import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '../../components/card';
import { Checkbox } from '../../components/checkbox';
import { Icon } from '../../components/icon';
import { IconButton } from '../../components/icon-button';
import type { Merchant } from '../../features/merchants/queries';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

type Props = {
  merchant: Merchant;
  onPress: () => void;
  /**
   * Asks the screen above to open the confirmation. The card does not own that dialog: FlashList
   * recycles cells, so "which merchant is being deleted" held here could survive into another row.
   */
  onRemove: () => void;
  /** Only the owner removes a system, or selects it for removal; a member's card has neither. */
  canRemove: boolean;
  /** The list is in selection mode: a tap toggles the card instead of opening it, and the delete icon gives way to a box. */
  selecting: boolean;
  selected: boolean;
  /** A long press starts selection with this card picked. */
  onLongPress: () => void;
};

export function SystemCard({ merchant, onPress, onRemove, canRemove, selecting, selected, onLongPress }: Props) {
  const { colors } = useAppTheme();

  // The end of the title row: the delete icon in `error` (a destructive action, .claude/instruction_mds/frontend.md
  // rule 9), or the selection box while selecting. A member's card has neither.
  const end = !canRemove ? undefined : selecting ? (
    <View style={styles.end} pointerEvents="none">
      <Checkbox.Android status={selected ? 'checked' : 'unchecked'} color={colors.primary} />
    </View>
  ) : (
    <IconButton icon="delete" iconColor={colors.error} onPress={onRemove} accessibilityLabel={`Remove ${merchant.name}`} />
  );

  return (
    <Card
      mode="contained"
      onPress={onPress}
      onLongPress={canRemove ? onLongPress : undefined}
      accessibilityState={selecting ? { selected } : undefined}
    >
      <StoreTile />
      <CardTitle title={merchant.name} end={end} />
      {/* A picked card is ringed in `primary`, laid over the card so it adds no size and the cards stay level. */}
      {selected ? <View pointerEvents="none" style={[styles.ring, { borderColor: colors.primary }]} /> : null}
    </Card>
  );
}

/**
 * The name row both the store cards and the Create card share, so the two are the same height: 72dp. The height is
 * pinned because Card.Title drops to 50 when it has no `left` or `right` (CardTitle.tsx:158), and only an owner's card
 * has the delete icon.
 */
export function CardTitle({ title, end }: { title: string; end?: ReactNode }) {
  return (
    <Card.Title
      title={title}
      titleVariant="titleMedium"
      style={styles.title}
      right={end ? () => end : undefined}
    />
  );
}

/**
 * Where a photo will go. Not Card.Cover: it hardcodes height 195 (Card/CardCover.js:61), so it neither scales with
 * the column count nor survives a 150% font scale (.claude/instruction_mds/frontend.md §7). A fixed *ratio* does both,
 * and it is already the right shape for a real image to drop into later.
 */
export function StoreTile({ children }: { children?: ReactNode }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.tile, { backgroundColor: colors.surfaceVariant }]}>
      {children ?? <Icon source="storefront" size={48} color={colors.onSurfaceVariant} />}
    </View>
  );
}

const styles = StyleSheet.create({
  // Level with the delete icon it replaces: Card.Title gives `right` no inset of its own.
  end: { paddingRight: spacing.xs },
  title: { minHeight: 72 },
  ring: { ...StyleSheet.absoluteFill, borderWidth: 2, borderRadius: radius.lg, borderCurve: 'continuous' },
  // No height. aspectRatio only, so the tile grows and shrinks with whatever width the column count
  // gives the card. 16:9, not square: a square placeholder made the card mostly empty grey on a
  // tablet. Its top corners follow the card's, which Paper rounds from `roundness` (×3).
  tile: {
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
});
