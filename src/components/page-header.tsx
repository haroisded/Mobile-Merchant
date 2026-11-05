import { Children } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useShellWide } from '../lib/columns';
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
  /** Buttons beside the title when wide, under it when narrow. Nulls count for nothing (a record's Delete, a form's Save). */
  actions?: ReactNode;
};

/**
 * The page header from .claude/instruction_mds/frontend.md §5: kicker, headlineMedium title, a
 * bodySmall line, the actions, and the 2px rule below. Every Setup screen opens with one, which is what
 * earns it a place in src/components/.
 */
export function PageHeader({ kicker, title, meta, onBack, actions }: Props) {
  const { colors } = useAppTheme();
  // Wide, the actions sit at the end of the title's row; narrow, on a row of their own under it. Not
  // left to flexWrap: Yoga shrank the title to a few letters beside the actions instead of wrapping
  // them (Assets on a phone, 2026-10-03).
  const wide = useShellWide();
  const buttons = Children.toArray(actions);

  return (
    <View style={styles.wrap}>
      <View style={wide ? styles.row : styles.stack}>
        <View style={styles.head}>
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
        </View>
        {buttons.length > 0 ? <View style={styles.actions}>{buttons}</View> : null}
      </View>
      <View style={[styles.rule, { backgroundColor: colors.onSurface }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:{ gap: spacing.ms, paddingHorizontal: spacing.md, paddingTop: spacing.ms },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.ms },
  stack: { gap: spacing.sm },
  // IconButton ships a 6dp margin of its own; zeroed so the row's gap is the only spacing.
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, flexGrow: 1, flexShrink: 1 },
  back: { margin: 0 },
  titles: { flex: 1, gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rule: { height: 2 },
});
