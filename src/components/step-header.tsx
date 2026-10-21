import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../lib/theme';
import { spacing } from '../themes';
import { IconButton } from './icon-button';
import { ProgressBar } from './progress-bar';
import { Text } from './text';

type Props = {
  /** Zero-based. */
  index: number;
  count: number;
  title: string;
  /** Appended to "Step n of m" as " · Optional". */
  optional?: boolean;
  /** Draws the title in the error colour: this step holds a field that failed validation. */
  failed?: boolean;
  backLabel: string;
  onBack: () => void;
};

/** A narrow stepper's header: back, "Step n of m", the step's title and progress. The product form and the receipt wizard share it. */
export function StepHeader({ index, count, title, optional, failed, backLabel, onBack }: Props) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.stepper}>
      <View style={styles.row}>
        <IconButton icon="chevron-left" disabled={index === 0} onPress={onBack} accessibilityLabel={backLabel} style={styles.back} />
        <View style={styles.fill}>
          <Text variant="labelMedium" style={{ color: colors.onSurfaceMuted }}>
            {`Step ${index + 1} of ${count}${optional ? ' · Optional' : ''}`}
          </Text>
          <Text variant="titleMedium" style={failed ? { color: colors.error } : undefined}>
            {title}
          </Text>
        </View>
      </View>
      <ProgressBar progress={(index + 1) / count} color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  stepper: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // IconButton ships a 6dp margin of its own; zeroed so the row's gap is the only spacing.
  back: { margin: 0 },
});
