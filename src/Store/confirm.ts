import { create } from 'zustand';

/** A destructive confirm: what it asks, the write it runs, and where to go once it has. */
export type ConfirmRequest = {
  kicker?: string;
  title: string;
  body: string;
  confirmLabel: string;
  /** The write. Usually a feature mutation's mutateAsync, so its own invalidation still runs. */
  run: () => Promise<void>;
  /** The copy for a failed write: SQLSTATE-specific where the screen expects one (src/lib/errors.ts). */
  failure: (cause: Error) => string;
  /** After a successful write: close the confirm and whatever it was opened from. */
  onDone: () => void;
};

/**
 * The open narrow confirm. A confirm on a phone is the native sheet route src/app/(app)/sheets/confirm.tsx
 * (.claude/instruction_mds/frontend.md §4.4), and a route takes neither a callback nor a function as a
 * param, so the opener leaves the request here — as src/Store/picker.ts does for the picker. Client state,
 * nothing fetched (.claude/instruction_mds/data-layer.md rule 9). Each open replaces the last.
 */
const useConfirmStore = create<{ request: ConfirmRequest | null }>(() => ({ request: null }));

export const openConfirm = (request: ConfirmRequest) => useConfirmStore.setState({ request });

export const useConfirmRequest = () => useConfirmStore((state) => state.request);
