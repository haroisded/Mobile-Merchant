import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';

import { useShellWide } from '../lib/columns';
import { useDiscard } from './use-discard';

/**
 * Ask before a page form with unsaved changes is left — Android's Back, the iOS swipe, the header's arrow: anything
 * that removes the page. Restored from 07bd7aa's src/lib/unsaved-guard.ts after New Item dropped typed fields without
 * a word (system test, 2026-10-22), on useDiscard's confirm.
 *
 * Off while the form's own write is out (`saving`): a save that leaves the page — New Item's router.back() — is the
 * save, not a loss. A paused write still lands on its own, so leaving it is safe too. Render the returned dialog
 * (wide: a Dialog; narrow the confirm sheet, which Discard closes before leaving).
 */
export function useLeaveGuard(unsaved: boolean, saving: boolean) {
  const navigation = useNavigation();
  const wide = useShellWide();
  const discard = useDiscard();

  usePreventRemove(unsaved && !saving, ({ data }) => {
    discard.ask(true, () => {
      if (!wide) router.back();
      navigation.dispatch(data.action);
    });
  });

  return discard.dialog;
}
