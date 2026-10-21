import { useState } from 'react';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { LevelPicker } from '../../components/level-picker';
import { NoteCallout } from '../../components/note-callout';
import { useMerchant, useSetStoreLevelMutation } from '../../features/merchants/queries';
import { failureMessage, mutationNotice } from '../../lib/errors';

/**
 * The owner's change of a store's level — the body of src/app/(app)/forms/store-level.tsx, opened from Features: a full
 * page on a phone, a Dialog over Features on a tablet (AdaptiveDialog `asPage`). merchants_guard_level refuses anyone
 * else; what a level adds is the database's (private.apply_level), and nothing is ever deleted.
 */
export function StoreLevelForm({ merchantId, onDismiss }: { merchantId: string; onDismiss: () => void }) {
  const store = useMerchant(merchantId);
  // The list Features was opened from has the store: a cache hit.
  if (!store) return null;
  return <LevelForm merchantId={merchantId} saved={store.merchant.level} onDismiss={onDismiss} />;
}

function LevelForm({ merchantId, saved, onDismiss }: { merchantId: string; saved: number; onDismiss: () => void }) {
  const [level, setLevel] = useState(saved);
  const save = useSetStoreLevelMutation({ merchantId });
  const inFlight = save.isPending && !save.isPaused;
  const notice = mutationNotice(save, failureMessage("Couldn't change the level. Try again."));
  // One handler a render, so two quick taps share saveOnce's guard. The same level saves nothing.
  const send = saveOnce(save, onDismiss);

  return (
    <AdaptiveDialog
      asPage
      onDismiss={onDismiss}
      dismissable={!inFlight}
      kicker="Features"
      title="Store Level"
      notice={notice}
      actions={<FormActions mutation={save} onCancel={onDismiss} onSave={() => (level === saved ? onDismiss() : send(level))} />}
    >
      <NoteCallout>
        Changing the level takes everyone&apos;s menu in this store back to the new level&apos;s, and changes which New Item fields show.
        What a level sets up for you, such as a register, is added; nothing is deleted.
      </NoteCallout>
      <LevelPicker value={level} onChange={setLevel} disabled={save.isPending} />
    </AdaptiveDialog>
  );
}
