import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useDeleteMerchantMutation } from '../features/merchants/queries';
import type { Merchant } from '../features/merchants/queries';
import { failureMessage } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { AdaptiveDialog } from './adaptive-dialog';
import { Button } from './button';
import { HelperText } from './helper-text';
import { Text } from './text';
import { TextInput } from './text-input';

type Props = {
  merchant: Merchant;
  /** Home's own width decision: a Dialog on a multi-column container. */
  wide: boolean;
  /** Rendered as the body of the narrow formSheet route (src/app/(app)/sheets/remove-system.tsx). */
  inSheet?: boolean;
  onDismiss: () => void;
};

// The one line under the field, which is either state and never both. Annotated rather than written
// with `as const` below: `require-safety-comment-for-type-assertion` is an error rule, and an
// assertion here would carry a comment justifying nothing.
type Notice = { type: 'error' | 'info'; text: string };

/**
 * The destructive confirmation for removing a POS system.
 *
 * Hosted by the Home screen rather than by SystemCard, even though the card carries the trigger.
 * FlashList recycles its cells, so state owned by a cell can outlive the row it belonged to and
 * reappear against another one — a dialog holding "which merchant am I deleting" is exactly the
 * kind of state that must not live there. One dialog above the list has no recycling to survive.
 * In src/components/ because two hosts render it: Home on a wide container, the sheet route on a
 * narrow one.
 *
 * Nothing here caps the OS font scale. A card grid is scanned and gets SCAN_CAP; a dialog is read,
 * and it collects a typed value, so both instruction_mds/typography.md §5 exemptions apply at once.
 */
export function RemoveSystemDialog({ merchant, wide, inSheet, onDismiss }: Props) {
  const { colors } = useAppTheme();
  const deleteMerchant = useDeleteMerchantMutation();
  const [typed, setTyped] = useState('');

  // The whole safety mechanism, and it is one comparison — which is why this is plain state and
  // not react-hook-form with a Zod resolver like the create-system form. Zod earns its place where
  // there are fields, per-field messages and a schema shared with a mutation
  // (instruction_mds/data-layer.md §4). Here there is one field, one rule, and no message: the control the
  // user sees is the Delete button staying disabled.
  //
  // Trimmed because a trailing space from an autocorrect bar is not a different intention, and
  // there is no merchant name for which the space is the meaningful part.
  const confirmed = typed.trim() === merchant.name;

  // "Genuinely in flight", which is not the same as `isPending`. Mutations default to
  // networkMode: 'online' and src/lib/query.ts wires onlineManager, so an offline delete is PAUSED
  // rather than failed — fired, queued, and `isPending` the whole time it waits for a connection.
  // Locking the dialog on `isPending` alone would therefore seal the user in with a spinner and no
  // exit until the network came back, which is the trap this line exists to avoid.
  //
  // Dismissing while PAUSED is deliberate and harmless: the mutation stays queued, runs on
  // reconnect, and the mutation-level onSuccess in queries.ts still invalidates, so the card leaves
  // the grid whether or not this dialog is still open to see it.
  const inFlight = deleteMerchant.isPending && !deleteMerchant.isPaused;

  // Paused and failed share one slot, so the dialog reserves one line rather than two.
  const notice: Notice | null = deleteMerchant.isPaused
    ? { type: 'info', text: 'Waiting for a connection. This finishes on its own when you reconnect.' }
    : deleteMerchant.isError
      ? // Not `deleteMerchant.error.message`: a PostgREST string names columns and policies, which
        // tells the user nothing they can act on. failureMessage swaps in the offline copy when
        // that is the better explanation.
        { type: 'error', text: failureMessage("Couldn't remove this system. Try again.") }
      : null;

  return (
    <AdaptiveDialog
      wide={wide}
      inSheet={inSheet}
      onDismiss={onDismiss}
      dismissable={!inFlight}
      // A kicker in `error` marks the destructive confirm, as every other delete does
      // (instruction_mds/visual-language.md §5). The title starts at the left edge: nothing is centred (rule 8).
      kicker="Remove system"
      kickerTone="error"
      title={`Remove ${merchant.name}?`}
      actions={
        <>
          {/* `inFlight`, not `isPending`: a paused delete has to stay walkable-away-from, and this
              is the only exit left once the backdrop is locked. */}
          <Button mode="outlined" onPress={onDismiss} disabled={inFlight} contentStyle={styles.action}>
            Cancel
          </Button>
          <Button
            mode="contained"
            buttonColor={colors.error}
            textColor={colors.onError}
            // Disabled until the typed name matches exactly: no request is sent before then, which
            // is the "Typed name does NOT match" branch of the sequence diagram.
            disabled={!confirmed || deleteMerchant.isPending}
            loading={deleteMerchant.isPending}
            contentStyle={styles.action}
            onPress={() => {
              // The dialog closes on success only. On failure it stays open with the message in
              // the HelperText below, so a network drop is retried from where the user already is
              // instead of sending them back to the card to start over.
              deleteMerchant.mutate(merchant.id, { onSuccess: onDismiss });
            }}
          >
            Delete
          </Button>
        </>
      }
    >
      <Text variant="bodyMedium">
        This action is permanent and can&apos;t be reversed. Products, sales history, and employee
        records tied to this system will be deleted.
      </Text>

      {/* The typed-confirmation instruction. Distinct from the body copy above it — that explains the
          consequence, this one asks for an action — so it is not more bodyMedium. Not labelMedium
          either: that token uppercases (instruction_mds/typography.md §2), and the name shown here is the exact
          string to type, case included. bodySmall is the hint role. */}
      <Text variant="bodySmall">Type {merchant.name} to confirm</Text>

      <TextInput
        mode="outlined"
        dense
        // A *placeholder*, not a prefilled value. A confirmation field that arrives already matching
        // enables Delete on open and confirms nothing.
        placeholder={merchant.name}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={`Type ${merchant.name} to confirm`}
        disabled={deleteMerchant.isPending}
      />

      <HelperText type={notice?.type ?? 'error'} visible={notice !== null} padding="none">
        {notice?.text}
      </HelperText>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  // Full width in the narrow sheet, so the label sits at the left edge (instruction_mds/visual-language.md §5).
  action: { justifyContent: 'flex-start' },
});
