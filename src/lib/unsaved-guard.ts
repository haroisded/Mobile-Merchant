import { createContext, useContext } from 'react';
import type { RefObject } from 'react';

/** Runs `proceed` now, or holds it behind a "Discard your changes?" confirm. */
export type LeaveGuard = (proceed: () => void) => void;

/**
 * The shell's rail and drawer ask this before switching destination.
 *
 * `usePreventRemove` only sees a screen being removed from its own navigator. A drawer switch removes
 * nothing — the Products stack stays mounted underneath — so a form with unsaved changes would be left
 * without a word. The shell provides one ref; a screen with unsaved changes puts its guard in it while
 * they exist and takes it out after, and `SystemNav` calls it instead of navigating when it is set.
 *
 * A ref rather than state: the rail reads it at press time and nothing re-renders when it changes.
 */
export const UnsavedGuardContext = createContext<RefObject<LeaveGuard | null>>({ current: null });

export function useUnsavedGuard() {
  return useContext(UnsavedGuardContext);
}
