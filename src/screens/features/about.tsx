import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdaptiveDialog } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { useShellWide } from '../../lib/columns';
import { useAppTheme } from '../../lib/theme';
import { openAbout } from '../../Store/about';
import type { AboutRequest } from '../../Store/about';
import { spacing } from '../../themes';

/** A Features row's About: what it is for, then when to use it. Close only — it changes nothing. */
export function About({ request, inSheet, onDismiss }: { request: AboutRequest; inSheet?: boolean; onDismiss: () => void }) {
  const { colors } = useAppTheme();

  return (
    <AdaptiveDialog
      inSheet={inSheet}
      onDismiss={onDismiss}
      kicker={request.kind}
      title={request.title}
      actions={
        <Button mode="outlined" onPress={onDismiss} contentStyle={styles.action}>
          Close
        </Button>
      }
    >
      <View style={styles.part}>
        <Text variant="labelMedium" style={{ color: colors.accent }}>
          Purpose
        </Text>
        <Text variant="bodyMedium">{request.purpose}</Text>
      </View>
      <View style={styles.part}>
        <Text variant="labelMedium" style={{ color: colors.accent }}>
          Use-case
        </Text>
        <Text variant="bodyMedium">{request.useCase}</Text>
      </View>
    </AdaptiveDialog>
  );
}

/**
 * Open a row's About: a Dialog over the page wide, the native sheet route narrow (.claude/instruction_mds/frontend.md
 * §4.4, as useConfirm). Render `dialog` in the page; it is null until `show`.
 */
export function useAbout() {
  const wide = useShellWide();
  const [request, setRequest] = useState<AboutRequest | null>(null);

  const show = (next: AboutRequest) => {
    if (wide) {
      setRequest(next);
      return;
    }
    openAbout(next);
    router.push('/sheets/about');
  };

  const dialog = request ? <About request={request} onDismiss={() => setRequest(null)} /> : null;

  return { show, dialog };
}

const styles = StyleSheet.create({
  part: { gap: spacing.xs },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  action: { justifyContent: 'flex-start' },
});
