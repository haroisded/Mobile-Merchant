import { StyleSheet, View } from 'react-native';

import { Avatar } from '../../components/avatar';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Icon } from '../../components/icon';
import type { Merchant } from '../../features/merchants/queries';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

type Props = {
  merchant: Merchant;
  /**
   * True on a one-column container. Row and grid are genuinely different anatomies rather than the
   * same card at two widths — a row card stretched across a tablet is unreadable for the same
   * measure reason a 110-character line is (.claude/instruction_mds/frontend.md §4.3) — so the branch lives inside this
   * component instead of duplicating it into two files.
   */
  row: boolean;
  onPress: () => void;
  /**
   * Asks the screen above to open the confirmation. The card does not own that dialog: FlashList
   * recycles cells, so "which merchant is being deleted" held here could survive into another row.
   */
  onRemove: () => void;
  /** Only the owner removes a system; a member's card has no Remove. */
  canRemove: boolean;
};

export function SystemCard({ merchant, row, onPress, onRemove, canRemove }: Props) {
  const { colors } = useAppTheme();

  // Remove is wired; Edit is still unticked in the Priority filter, so it renders and does nothing.
  // `error`/`onError` are read from the theme, which is the one place a colour may be chosen by
  // hand (.claude/instruction_mds/frontend.md rule 5).
  const actions = (
    // Wraps: at a large font scale the two buttons are wider than a grid card.
    <Card.Actions style={styles.actions}>
      <Button mode="contained" icon="edit">
        Edit
      </Button>
      {canRemove ? (
        <Button mode="contained" icon="delete" buttonColor={colors.error} textColor={colors.onError} onPress={onRemove}>
          Remove
        </Button>
      ) : null}
    </Card.Actions>
  );

  if (row) {
    return (
      <Card mode="contained" onPress={onPress}>
        <Card.Title
          title={merchant.name}
          titleVariant="titleMedium"
          left={(props) => <Avatar.Icon {...props} icon="storefront" />}
        />
        {actions}
      </Card>
    );
  }

  return (
    <Card mode="contained" onPress={onPress}>
      {/*
        Where a photo will go. Not Card.Cover: it hardcodes height 195
        (Card/CardCover.js:61), so it neither scales with the column count nor survives a 150% font
        scale (.claude/instruction_mds/frontend.md §7). A fixed *ratio* does both, and it is already the right shape
        for a real image to drop into later.
      */}
      <View style={[styles.tile, { backgroundColor: colors.surfaceVariant }]}>
        <Icon source="storefront" size={48} color={colors.onSurfaceVariant} />
      </View>
      <Card.Title
        title={merchant.name}
        titleVariant="titleMedium"
      />
      {actions}
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { flexWrap: 'wrap', rowGap: spacing.sm },
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
