import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useDeleteMerchantsMutation } from '../features/merchants/queries';
import type { Merchant } from '../features/merchants/queries';
import { failureMessage } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { AdaptiveDialog } from './adaptive-dialog';
import { Button } from './button';
import { HelperText } from './helper-text';
import { Text } from './text';
import { TextInput } from './text-input';

type Props = {
  /** One store, from its card's delete icon, or several, from the list's selection bar. */
  merchants: Merchant[];
  /** Rendered as the body of the narrow formSheet route (src/app/(app)/sheets/remove-system.tsx); otherwise a Dialog. */
  inSheet?: boolean;
  onDismiss: () => void;
};

/** What a bulk remove asks to be typed: the names of several stores are too much to retype. */
const BULK_WORD = 'DELETE';

// The one line under the field, which is either state and never both. Annotated rather than written
// with `as const` below: `require-safety-comment-for-type-assertion` is an error rule, and an
// assertion here would carry a comment justifying nothing.
type Notice = { type: 'error' | 'info'; text: string };

/** The words that differ between one store and several, chosen once rather than at every line that shows them. */
function wordsFor(merchants: Merchant[]) {
  const [first] = merchants;
  if (merchants.length === 1 && first) {
    return {
      single: true,
      word: first.name,
      kicker: 'Remove store',
      title: `Remove ${first.name}?`,
      body: "This action is permanent and can't be reversed. Everything kept in this store will be deleted.",
      failure: "Couldn't remove this store. Try again.",
    };
  }
  return {
    single: false,
    word: BULK_WORD,
    kicker: 'Remove stores',
    title: `Remove ${merchants.length} stores?`,
    body: "This action is permanent and can't be reversed. Everything kept in these stores will be deleted:",
    failure: "Couldn't remove these stores. Try again.",
  };
}

// Paused and failed share one slot, so the dialog reserves one line rather than two.
function noticeFor(mutation: { isPaused: boolean; isError: boolean }, failure: string): Notice | null {
  if (mutation.isPaused) return { type: 'info', text: 'Waiting for a connection. This finishes on its own when you reconnect.' };
  // Not the error's own message: a PostgREST string names columns and policies, which tells the user nothing they
  // can act on. failureMessage swaps in the offline copy when that is the better explanation.
  return mutation.isError ? { type: 'error', text: failureMessage(failure) } : null;
}

/**
 * The destructive confirmation for removing a store, or several at once. One store asks for its name typed, as it
 * always has; several list their names and ask for DELETE.
 *
 * Hosted by the Home screen rather than by SystemCard, even though the card carries the trigger.
 * FlashList recycles its cells, so state owned by a cell can outlive the row it belonged to and
 * reappear against another one — a dialog holding "which merchant am I deleting" is exactly the
 * kind of state that must not live there. One dialog above the list has no recycling to survive.
 * In src/components/ because two hosts render it: Home on a wide container, the sheet route on a
 * narrow one.
 */
export function RemoveSystemDialog({ merchants, inSheet, onDismiss }: Props) {
  const { colors } = useAppTheme();
  const deleteMerchant = useDeleteMerchantsMutation();
  const [typed, setTyped] = useState('');

  // The whole safety mechanism, and it is one comparison — which is why this is plain state and
  // not react-hook-form with a Zod resolver like the create-system form. Zod earns its place where
  // there are fields, per-field messages and a schema shared with a mutation
  // (.claude/instruction_mds/data-layer.md §4). Here there is one field, one rule, and no message: the control the
  // user sees is the Delete button staying disabled.
  //
  // Trimmed because a trailing space from an autocorrect bar is not a different intention, and
  // there is no merchant name for which the space is the meaningful part.
  const { single, word, kicker, title, body, failure } = wordsFor(merchants);
  const confirmed = typed.trim() === word;

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

  const notice = noticeFor(deleteMerchant, failure);

  return (
    <AdaptiveDialog
      inSheet={inSheet}
      onDismiss={onDismiss}
      dismissable={!inFlight}
      // A kicker in `error` marks the destructive confirm, as every other delete does
      // (.claude/instruction_mds/frontend.md §5). The title starts at the left edge: nothing is centred (rule 8).
      kicker={kicker}
      kickerTone="error"
      title={title}
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
              deleteMerchant.mutate(
                merchants.map((merchant) => merchant.id),
                { onSuccess: onDismiss }
              );
            }}
          >
            Delete
          </Button>
        </>
      }
    >
      <Text variant="bodyMedium">{body}</Text>
      {/* One block, a name a line: the body's gap between siblings would space a list out like paragraphs. */}
      {single ? null : (
        <Text variant="bodyMedium">{merchants.map((merchant) => `· ${merchant.name}`).join('\n')}</Text>
      )}

      {/* The typed-confirmation instruction. Distinct from the body copy above it — that explains the
          consequence, this one asks for an action — so it is not more bodyMedium. Not labelMedium
          either: that token uppercases (.claude/instruction_mds/frontend.md §3.1), and the name shown here is the exact
          string to type, case included. bodySmall is the hint role. */}
      <Text variant="bodySmall">Type {word} to confirm</Text>

      <TextInput
        mode="outlined"
        dense
        // A *placeholder*, not a prefilled value. A confirmation field that arrives already matching
        // enables Delete on open and confirms nothing.
        placeholder={word}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={`Type ${word} to confirm`}
        disabled={deleteMerchant.isPending}
      />

      <HelperText type={notice?.type ?? 'error'} visible={notice !== null} padding="none">
        {notice?.text}
      </HelperText>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  // Full width in the narrow sheet, so the label sits at the left edge (.claude/instruction_mds/frontend.md §5).
  action: { justifyContent: 'flex-start' },
});
