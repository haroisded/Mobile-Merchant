import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../lib/theme';
import { radius, spacing } from '../themes';
import { Text } from './text';

// A worked sample inside a form — the Currency page's receipt total, a tax template's Preview, Stock Settings'
// valuation example (.claude/instruction_mds/frontend.md §5, Calculation preview): a 1px outlineVariant box of
// lines, each a bodyMedium label left and an `amount` right.

export function SampleBox({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return <View style={[styles.box, { borderColor: colors.outlineVariant }]}>{children}</View>;
}

/** One line of the sample; `sub` is a bodySmall line under the label (a tax row's running Total). */
export function SampleLine({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.line}>
      <View style={styles.fill}>
        <Text variant="bodyMedium">{label}</Text>
        {sub ? (
          <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Text variant="amount">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.ms, gap: spacing.xs },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
});
