import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { useShellWide } from '../lib/columns';
import { mutationNotice } from '../lib/errors';
import type { Notice } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { openConfirm } from '../Store/confirm';
import type { ConfirmRequest } from '../Store/confirm';
import { AdaptiveDialog } from './adaptive-dialog';
import { Button } from './button';
import { HelperText } from './helper-text';
import { Text } from './text';

type Props = {
  /** Rendered as the body of a narrow formSheet route (src/app/(app)/sheets/). */
  inSheet?: boolean;
  onDismiss: () => void;
  kicker: string;
  /** `error` for a destructive confirm, `accent` for one that loses nothing — a document's Submit. */
  tone?: 'accent' | 'error';
  title: string;
  confirmLabel: string;
  /** "Cancel" unless the confirm itself is a cancel, where two Cancels would read as one. */
  dismissLabel?: string;
  onConfirm: () => void;
  /** The confirm's write: Cancel and dismiss lock while it is in flight (.claude/instruction_mds/data-layer.md §5). */
  mutation: { isPending: boolean; isPaused: boolean };
  notice: Notice | null;
  children: ReactNode;
};

/**
 * A confirm: Cancel, the confirm — red unless `tone` is `accent` — and the write's notice above the buttons.
 * Every Setup master's Delete opens one (.claude/instruction_mds/structure.md rule 7), and so do a
 * document's Submit and Cancel.
 */
export function ConfirmDialog({ inSheet, onDismiss, kicker, tone = 'error', title, confirmLabel, dismissLabel = 'Cancel', onConfirm, mutation, notice, children }: Props) {
  const { colors } = useAppTheme();
  const inFlight = mutation.isPending && !mutation.isPaused;
  const destructive = tone === 'error';

  return (
    <AdaptiveDialog
      inSheet={inSheet}
      onDismiss={onDismiss}
      dismissable={!inFlight}
      kicker={kicker}
      kickerTone={tone}
      title={title}
      actions={
        <>
          <Button mode="outlined" onPress={onDismiss} disabled={inFlight} contentStyle={styles.action}>
            {dismissLabel}
          </Button>
          <Button
            mode="contained"
            // Left to Paper when not destructive: a contained Button is the theme's primary.
            buttonColor={destructive ? colors.error : undefined}
            textColor={destructive ? colors.onError : undefined}
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

/**
 * A ConfirmRequest on screen: the confirm above, running the request's write. The body of both the wide
 * Dialog from useConfirm and the narrow sheet route (src/app/(app)/sheets/confirm.tsx).
 */
export function RequestConfirm({ request, inSheet, onDismiss }: { request: ConfirmRequest; inSheet?: boolean; onDismiss: () => void }) {
  // The confirm's own mutation around the request's write: it pauses offline like any other, and its
  // state is what locks this confirm while the write is out.
  const write = useMutation({ mutationFn: request.run });
  const notice = mutationNotice(write, write.error ? request.failure(write.error) : '');

  return (
    <ConfirmDialog
      inSheet={inSheet}
      onDismiss={onDismiss}
      kicker={request.kicker ?? 'Delete'}
      tone={request.tone}
      title={request.title}
      confirmLabel={request.confirmLabel}
      dismissLabel={request.dismissLabel}
      onConfirm={() => {
        if (!write.isPending) write.mutate(undefined, { onSuccess: request.onDone });
      }}
      mutation={write}
      notice={notice}
    >
      <Text variant="bodyMedium">{request.body}</Text>
    </ConfirmDialog>
  );
}

/**
 * Ask before a write that cannot be taken back: a Dialog over the screen wide, the native sheet route narrow
 * (.claude/instruction_mds/frontend.md §4.4). Render `dialog` in the screen; it is null until `ask`.
 */
export function useConfirm() {
  const wide = useShellWide();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const ask = (next: ConfirmRequest) => {
    if (wide) {
      // Done closes the Dialog too: a confirm whose screen stays (a document's Submit) has nothing else to.
      setRequest({
        ...next,
        onDone: () => {
          setRequest(null);
          next.onDone();
        },
      });
      return;
    }
    openConfirm(next);
    router.push('/sheets/confirm');
  };

  const dialog = request ? <RequestConfirm request={request} onDismiss={() => setRequest(null)} /> : null;

  return { ask, dialog };
}

/**
 * A confirmed delete from a small form: wide, the confirm is a Dialog over the form's Dialog, and closing the
 * form closes both; narrow, it is a sheet over the form's page, and both pop together.
 */
export const closesForm = (wide: boolean, onDismiss: () => void) => (wide ? onDismiss : () => router.dismiss(2));

const styles = StyleSheet.create({
  action: { justifyContent: 'flex-start' },
});
