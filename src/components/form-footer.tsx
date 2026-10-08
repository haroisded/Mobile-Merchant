import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Notice } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { spacing } from '../themes';
import { HelperText } from './helper-text';

/**
 * A full-page form's bottom bar: the save or offline notice above the buttons. Shared by the Setup
 * screens that are a form (Company first).
 *
 * SafeAreaView, not View: the Android build is edge-to-edge (android/gradle.properties), so a bar pinned
 * to the bottom draws behind the system navigation bar. `additive` adds the inset to the bar's own
 * padding.
 */
export function FormFooter({ notice, children }: { notice: Notice | null; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView edges={['bottom']} style={[styles.footer, { borderTopColor: colors.outlineVariant, backgroundColor: colors.surface }]}>
      {notice ? (
        <HelperText type={notice.type} padding="none">
          {notice.text}
        </HelperText>
      ) : null}
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing.sm, padding: spacing.ms, borderTopWidth: 1 },
});
