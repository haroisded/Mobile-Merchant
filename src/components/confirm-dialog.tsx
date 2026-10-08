import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import type { Notice } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { AdaptiveDialog } from './adaptive-dialog';
import { Button } from './button';
import { HelperText } from './helper-text';

type Props = {
  /** Rendered as the body of a narrow formSheet route (src/app/(app)/sheets/). */
  inSheet?: boolean;
  onDismiss: () => void;
  kicker: string;
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** The confirm's write: Cancel and dismiss lock while it is in flight (.claude/instruction_mds/data-layer.md §5). */
  mutation: { isPending: boolean; isPaused: boolean };
  notice: Notice | null;
  children: ReactNode;
};

/**
 * A destructive confirm: Cancel, a red confirm, and the write's notice under the body. Every Setup
 * master's Delete opens one (.claude/instruction_mds/structure.md rule 7).
 */
export function ConfirmDialog({ inSheet, onDismiss, kicker, title, confirmLabel, onConfirm, mutation, notice, children }: Props) {
  const { colors } = useAppTheme();
  const inFlight = mutation.isPending && !mutation.isPaused;

  return (
    <AdaptiveDialog
      inSheet={inSheet}
      onDismiss={onDismiss}
      dismissable={!inFlight}
      kicker={kicker}
      kickerTone="error"
      title={title}
      actions={
        <>
          <Button mode="outlined" onPress={onDismiss} disabled={inFlight} contentStyle={styles.action}>
            Cancel
          </Button>
          <Button
            mode="contained"
            buttonColor={colors.error}
            textColor={colors.onError}
            onPress={onConfirm}
            loading={mutation.isPending}
            disabled={mutation.isPending}
            contentStyle={styles.action}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      <HelperText type={notice?.type ?? 'error'} visible={notice !== null} padding="none">
        {notice?.text}
      </HelperText>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  action: { justifyContent: 'flex-start' },
});
