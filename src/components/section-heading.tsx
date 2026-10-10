import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../lib/theme';
import { spacing } from '../themes';
import { Text } from './text';

/**
 * A section heading inside a full-page form — the Company's Accounts and Stock, an Item Group's Defaults:
 * headlineSmall and its bodySmall hint (.claude/instruction_mds/frontend.md §5).
 */
export function SectionHeading({ title, hint }: { title: string; hint: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.heading}>
      <Text variant="headlineSmall">{title}</Text>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { gap: spacing.xs, paddingTop: spacing.md },
});
