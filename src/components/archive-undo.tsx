import { useState } from 'react';
import type { ReactNode } from 'react';

import { useSetProductStatusMutation } from '../features/products/queries';
import type { ProductStatus } from '../features/products/schema';
import { failureMessage } from '../lib/errors';
import { Snackbar } from './snackbar';

/** A row as archiving needs to know it: what to archive, and what to put back on Undo. */
export type ArchiveTarget = { id: string; name: string; status: ProductStatus };

/**
 * Archive, with Undo.
 *
 * Archive used to open the delete dialog and ask again (the sheet was even headed "Delete product"),
 * which made the safe, reversible action feel like the destructive one. It now just archives, and the
 * snackbar carries the way back — the standard undo pattern, and the reason there is no confirm.
 * Delete keeps its own confirm, because that one cannot be undone.
 *
 * In src/components/ because the list and the detail screen both archive (instruction_mds/structure.md rule 6).
 * Returns the snackbar to render, so a screen spends one line on it.
 */
export function useArchiveUndo() {
  const setStatus = useSetProductStatusMutation();
  const [undone, setUndone] = useState<ArchiveTarget[] | null>(null);
  // What the last write did, for the snackbar's wording. Restore is archive's inverse and shares its
  // Undo: restoring puts an archived product back as a draft, and Undo archives it again.
  const [restored, setRestored] = useState(false);
  const [failed, setFailed] = useState(false);

  const write = (targets: ArchiveTarget[], status: 'archived' | 'draft', onDone?: () => void) => {
    setFailed(false);
    setRestored(status === 'draft');
    setStatus.mutate(
      { ids: targets.map((target) => target.id), status },
      {
        onSuccess: () => {
          setUndone(targets);
          onDone?.();
        },
        onError: () => setFailed(true),
      }
    );
  };
  const archive = (targets: ArchiveTarget[], onDone?: () => void) => write(targets, 'archived', onDone);
  // Back as a draft rather than active: an archived product may be months stale, so it is checked in
  // the edit form ("Save as active") before the register sells it again.
  const restore = (targets: ArchiveTarget[]) => write(targets, 'draft');

  const undo = () => {
    const targets = undone ?? [];
    setUndone(null);
    // One call per status the selection came from: a bulk archive can hold a draft and an active
    // product, and each goes back to what it was, not to a status it never had.
    for (const status of new Set(targets.map((target) => target.status))) {
      const ids = targets.filter((target) => target.status === status).map((target) => target.id);
      setStatus.mutate({ ids, status });
    }
  };

  const single = undone?.length === 1 ? undone[0] : undefined;
  const done = restored ? 'restored as a draft' : 'archived';
  const message = failed
    ? failureMessage(restored ? "Couldn't restore. Try again." : "Couldn't archive. Try again.")
    : single
      ? `${single.name} ${done}`
      : `${undone?.length ?? 0} items ${done}`;

  const snackbar: ReactNode = (
    <Snackbar
      visible={undone !== null || failed}
      onDismiss={() => {
        setUndone(null);
        setFailed(false);
      }}
      duration={6000}
      action={failed ? undefined : { label: 'Undo', onPress: undo }}
    >
      {message}
    </Snackbar>
  );

  return { archive, restore, snackbar, archiving: setStatus.isPending && !setStatus.isPaused };
}
