import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../lib/theme';
import { radius, spacing } from '../themes';
import { Text } from './text';

/**
 * A 3px left rule on surfaceMuted: accent for a note, error for a warning (instruction_mds/visual-language.md §5).
 * In src/components/ because the product form and the archive dialog both draw one.
 */
export function NoteCallout({ tone = 'accent', children }: { tone?: 'accent' | 'error'; children: ReactNode }) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.note,
        { backgroundColor: colors.surfaceMuted, borderLeftColor: tone === 'error' ? colors.error : colors.accent },
      ]}
    >
      <Text variant="bodySmall">{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingVertical: spacing.ms,
    paddingHorizontal: spacing.ms,
  },
});
