import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../lib/theme';
import { radius, spacing } from '../themes';
import { Text } from './text';

/**
 * A 1px box of rows, or the line an empty one shows (.claude/instruction_mds/frontend.md §5, "Ranked rows,
 * alert rows"). In src/components/ because the Dashboard and Import Items both list with it.
 */
export function RowBox({ empty, children }: { empty: string; children: ReactNode[] }) {
  const { colors } = useAppTheme();

  if (children.length === 0) return <Text variant="bodyMedium">{empty}</Text>;
  return <View style={[styles.box, { borderColor: colors.outlineVariant }]}>{children}</View>;
}

type RowProps = {
  first: boolean;
  title: string;
  sub: string;
  /** A figure at the row's end: a best seller's quantity or amount. */
  figure?: string;
  /** A status under the two lines, in `error`: an alert's (frontend.md §2.4). */
  alert?: string;
  /** `sub` is what the row says, not a fact beside its name — a mistake's message: body text, not muted. */
  plain?: boolean;
};

/** One row of a RowBox: a name over a line. A 1px surfaceVariant hairline above every row but the first. */
export function BoxRow({ first, title, sub, figure, alert, plain = false }: RowProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.row, first ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant }]}>
      <View style={styles.rowText}>
        <Text variant="titleMedium">{title}</Text>
        <Text variant={plain ? 'bodyMedium' : 'bodySmall'} style={plain ? undefined : { color: colors.onSurfaceMuted }}>
          {sub}
        </Text>
        {alert ? (
          <Text variant="labelMedium" style={{ color: colors.error }}>
            {alert}
          </Text>
        ) : null}
      </View>
      {figure ? <Text variant="titleMedium">{figure}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, padding: spacing.ms },
  rowText: { flex: 1, gap: spacing.xs },
});
