import { useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  Button,
  Dialog,
  HelperText,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { failureMessage } from '../../lib/errors';
import { useDeleteMerchantMutation } from './queries';
import type { Merchant } from './queries';

type Props = {
  merchant: Merchant;
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
 * kind of state that must not live there. One dialog above the list has no recycling to survive,
 * and it matches how CreateSystemModal is already mounted.
 *
 * Nothing here caps the OS font scale. A card grid is scanned and gets SCAN_CAP; a dialog is read,
 * and it collects a typed value, so both docs/typography.md §5 exemptions apply at once.
 */
export function RemoveSystemDialog({ merchant, onDismiss }: Props) {
  const { colors } = useTheme();
  const deleteMerchant = useDeleteMerchantMutation();
  const [typed, setTyped] = useState('');

  // The whole safety mechanism, and it is one comparison — which is why this is plain state and
  // not react-hook-form with a Zod resolver like CreateSystemModal. Zod earns its place where
  // there are fields, per-field messages and a schema shared with a mutation
  // (docs/data-layer.md §4). Here there is one field, one rule, and no message: the control the
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
    <Portal>
      {/*
        Dismissable except while the request is actually out. The backdrop alone is not enough —
        Android's hardware back button is a second exit, and leaving it live would let a delete be
        confirmed and then dismissed out from under itself.

        Dismissing while PAUSED is deliberate and harmless: the mutation stays queued, runs on
        reconnect, and the mutation-level onSuccess in queries.ts still invalidates, so the card
        leaves the grid whether or not this dialog is still open to see it.
      */}
      <Dialog
        visible
        dismissable={!inFlight}
        dismissableBackButton={!inFlight}
        onDismiss={onDismiss}
        style={styles.dialog}
      >
        {/*
          Paper's own Dialog.Icon, not a hand-placed Icon. The M3 analysis avoids it because it
          tints `secondary` — but that is only its *default*: `color || theme.colors.secondary`
          (Dialog/DialogIcon.js:62), so passing the error role gives the analysis's appearance and
          Paper's centred wrapper for free.
        */}
        <Dialog.Icon icon="alert" color={colors.error} />

        {/* No `variant`: DialogTitle picks headlineSmall itself (Dialog/DialogTitle.js:61), and
            passing one fights its own spacing (docs/typography.md rule 5). textAlign is not a type
            property, so centring it under the icon is not the call-site styling rule 2 forbids —
            it is what Paper's own icon example does. */}
        <Dialog.Title style={styles.title}>Remove {merchant.name}?</Dialog.Title>

        <Dialog.Content style={styles.content}>
          <Text variant="bodyMedium">
            This action is permanent and can&apos;t be reversed. Products, sales history, and
            employee records tied to this system will be deleted.
          </Text>

          {/* The typed-confirmation instruction. Distinct from the body copy above it — that
              explains the consequence, this one asks for an action — so it is not more bodyMedium.
              Not labelMedium either: that token uppercases (docs/typography.md §2), and the name
              shown here is the exact string to type, case included. bodySmall is the hint role. */}
          <Text variant="bodySmall">Type {merchant.name} to confirm</Text>

          <TextInput
            mode="outlined"
            // A *placeholder*, not a prefilled value. The M3 analysis reads the mockup's greyed
            // name as `value`, but a confirmation field that arrives already matching enables
            // Delete on open and confirms nothing. The revamp's own sequence diagram has the user
            // type it ("Types 'Cafe 67' and clicks Delete"), which is the reading that leaves the
            // mechanism intact.
            placeholder={merchant.name}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
            disabled={deleteMerchant.isPending}
          />

          <HelperText type={notice?.type ?? 'error'} visible={notice !== null}>
            {notice?.text}
          </HelperText>
        </Dialog.Content>

        <Dialog.Actions>
          {/* Both contained, per the analysis, and not equal weight: Cancel carries `primary` and
              Delete carries `error`. Paper's default contained button is already `primary`, so only
              the destructive one names a colour by hand — which is the one case CLAUDE.md §3 rule 2
              allows, read from the theme rather than written as a hex. */}
          {/* `inFlight`, not `isPending`: a paused delete has to stay walkable-away-from, and this
              is the only exit left once the backdrop is locked. */}
          <Button mode="contained" onPress={onDismiss} disabled={inFlight}>
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
            onPress={() => {
              // The dialog closes on success only. On failure it stays open with the message in
              // the HelperText above, so a network drop is retried from where the user already is
              // instead of sending them back to the card to start over.
              deleteMerchant.mutate(merchant.id, { onSuccess: onDismiss });
            }}
          >
            Delete
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  // Dialog has no maximum width of its own — its container is only
  // marginHorizontal: Math.max(left, right, 26) (Dialog/Dialog.js:95) — so on a 1000dp tablet this
  // would span ~950dp without it (docs/layout.md rule 7).
  dialog: { maxWidth: 560, alignSelf: 'center', width: '100%' },
  title: { textAlign: 'center' },
  content: { gap: 8 },
});
