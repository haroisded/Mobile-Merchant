import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { deleteAccount } from '../lib/auth';
import { failureMessage } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { AdaptiveDialog } from './adaptive-dialog';
import { Button } from './button';
import { HelperText } from './helper-text';
import { Text } from './text';

type Props = {
  /** Profile's own width decision: a Dialog on a multi-column container. */
  wide: boolean;
  /** Rendered as the body of the narrow formSheet route (src/app/(app)/sheets/delete-account.tsx). */
  inSheet?: boolean;
  onDismiss: () => void;
};

/**
 * Deleting an account has to be reachable in-app — App Store Guideline 5.1.1(v) — and it cannot be
 * undone, so Profile asks here first.
 *
 * The delete runs from this dialog, not from Profile: on a narrow container the dialog is a formSheet
 * route with no component tree shared with the screen underneath, so the request and its error live
 * where the button is. There is no success path to handle. The session going null flips the root
 * layout's guard, which drops the whole (app) history — this sheet included — and lands on sign-in.
 */
export function DeleteAccountDialog({ wide, inSheet, onDismiss }: Props) {
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
    } catch (e) {
      // The GoTrue detail goes to the dev console only; __DEV__ is stripped from release builds.
      if (__DEV__) console.warn('[delete-account]', e);
      setError(failureMessage("Couldn't delete your account. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdaptiveDialog
      wide={wide}
      inSheet={inSheet}
      onDismiss={onDismiss}
      dismissable={!busy}
      kicker="Delete account"
      kickerTone="error"
      title="Delete account?"
      actions={
        <>
          <Button mode="outlined" onPress={onDismiss} disabled={busy} contentStyle={styles.action}>
            Cancel
          </Button>
          <Button
            mode="contained"
            buttonColor={colors.error}
            textColor={colors.onError}
            onPress={() => void confirm()}
            loading={busy}
            disabled={busy}
            contentStyle={styles.action}
          >
            Delete
          </Button>
        </>
      }
    >
      <Text variant="bodyMedium">
        This permanently deletes your account and everything stored against it. It cannot be undone.
      </Text>
      <HelperText type="error" visible={error !== null} padding="none">
        {error}
      </HelperText>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  // Full width in the narrow sheet, so the label sits at the left edge (instruction_mds/visual-language.md §5).
  action: { justifyContent: 'flex-start' },
});
