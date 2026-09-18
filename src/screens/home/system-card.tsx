import { StyleSheet, View } from 'react-native';

import { Avatar } from '../../components/avatar';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Icon } from '../../components/icon';
import type { Merchant } from '../../features/merchants/queries';
import { CATEGORY_META } from '../../features/merchants/schema';
import { useAppTheme } from '../../lib/theme';
import { radius } from '../../themes';

// Capped at 1.3 because a card grid is *scanned*, not read: at a 200% accessibility setting an
// uncapped four-column grid becomes one card per screen. The cap applies here and nowhere else —
// body text, forms, dialogs and errors stay uncapped, which is where the setting does its job
// (instruction_mds/typography.md §5, instruction_mds/layout.md §5).
const SCAN_CAP = 1.3;

type Props = {
  merchant: Merchant;
  /**
   * True on a one-column container. Row and grid are genuinely different anatomies rather than the
   * same card at two widths — a row card stretched across a tablet is unreadable for the same
   * measure reason a 110-character line is (instruction_mds/layout.md §2) — so the branch lives inside this
   * component instead of duplicating it into two files.
   */
  row: boolean;
  onPress: () => void;
  /**
   * Asks the screen above to open the confirmation. The card does not own that dialog: FlashList
   * recycles cells, so "which merchant is being deleted" held here could survive into another row.
   */
  onRemove: () => void;
};

export function SystemCard({ merchant, row, onPress, onRemove }: Props) {
  const { colors } = useAppTheme();

  // Indexing a Record<StoreCategory, …> with the row's own enum value. No fallback and no `as`:
  // if the database ever holds a category the client does not know, that is a compile error at
  // this line, which is exactly when it should be found.
  const meta = CATEGORY_META[merchant.category];

  // Remove is wired; Edit is still unticked in the Priority filter, so it renders and does nothing.
  // `error`/`onError` are read from the theme, which is the one place a colour may be chosen by
  // hand (CLAUDE.md §3 rule 2).
  const actions = (
    <Card.Actions>
      <Button mode="contained" icon="edit">
        Edit
      </Button>
      <Button
        mode="contained"
        icon="delete"
        buttonColor={colors.error}
        textColor={colors.onError}
        onPress={onRemove}
      >
        Remove
      </Button>
    </Card.Actions>
  );

  if (row) {
    return (
      <Card mode="contained" onPress={onPress}>
        <Card.Title
          title={merchant.name}
          titleVariant="titleMedium"
          titleMaxFontSizeMultiplier={SCAN_CAP}
          left={(props) => <Avatar.Icon {...props} icon={meta.icon} />}
        />
        {actions}
      </Card>
    );
  }

  return (
    <Card mode="contained" onPress={onPress}>
      {/*
        Where the mockup shows a photo. Not Card.Cover: it hardcodes height 195
        (Card/CardCover.js:61), so it neither scales with the column count nor survives a 150% font
        scale (instruction_mds/layout.md rule 7). A fixed *ratio* does both, and it is already the right shape
        for a real image to drop into later.
      */}
      <View style={[styles.tile, { backgroundColor: colors.surfaceVariant }]}>
        <Icon source={meta.icon} size={48} color={colors.onSurfaceVariant} />
      </View>
      <Card.Title
        title={merchant.name}
        titleVariant="titleMedium"
        titleMaxFontSizeMultiplier={SCAN_CAP}
      />
      {actions}
    </Card>
  );
}

const styles = StyleSheet.create({
  // No height. aspectRatio only, so the tile grows and shrinks with whatever width the column count
  // gives the card. Its top corners follow the card's, which Paper rounds from `roundness` (×3).
  tile: {
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
});
