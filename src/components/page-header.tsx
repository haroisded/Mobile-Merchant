import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../lib/theme';
import { spacing } from '../themes';
import { IconButton } from './icon-button';
import { Text } from './text';

type Props = {
  /** The small uppercase line above the title, in the accent. */
  kicker: string;
  title: string;
  /** "24 products", "Unsaved changes are guarded on exit". */
  meta?: string;
  onBack?: () => void;
  /** Buttons at the end of the row; they wrap under the title when there is no room beside it. */
  actions?: ReactNode;
};

/**
 * The page header from instruction_mds/visual-language.md §5 "Structure": kicker, headlineMedium title, a
 * bodySmall line, the actions, and the 2px rule below. Shared by the product screens and the category
 * manager, and next by Discounts — which is what earns it a place in src/components/.
 */
export function PageHeader({ kicker, title, meta, onBack, actions }: Props) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {onBack ? <IconButton icon="arrow-back" onPress={onBack} accessibilityLabel="Back" style={styles.back} /> : null}
        <View style={styles.titles}>
          <Text variant="labelMedium" style={{ color: colors.accent }}>
            {kicker}
          </Text>
          <Text variant="headlineMedium" numberOfLines={2}>
            {title}
          </Text>
          {meta ? (
            <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
              {meta}
            </Text>
          ) : null}
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      <View style={[styles.rule, { backgroundColor: colors.onSurface }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:{ gap: spacing.ms, paddingHorizontal: spacing.md, paddingTop: spacing.ms },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: spacing.ms, rowGap: spacing.sm },
  // IconButton ships a 6dp margin of its own; zeroed so the row's gap is the only spacing.
  back: { alignSelf: 'center', margin: 0 },
  titles: { flexGrow: 1, flexShrink: 1, flexBasis: 180, gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rule: { height: 2 },
});
