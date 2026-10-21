import { useConfirm } from './confirm-dialog';

/**
 * Ask before unsaved changes are dropped — opening another role or employee beside the list, or leaving the Features
 * page with choices not saved. A Dialog wide, the confirm sheet narrow (useConfirm, .claude/instruction_mds/frontend.md §4.4).
 */
export function useDiscard() {
  const confirm = useConfirm();

  const ask = (dirty: boolean, go: () => void) => {
    if (!dirty) {
      go();
      return;
    }
    confirm.ask({
      kicker: 'Unsaved changes',
      title: 'Discard your changes?',
      body: "What you changed here isn't saved yet.",
      confirmLabel: 'Discard',
      dismissLabel: 'Keep editing',
      // Nothing to write: discarding is the confirm itself.
      run: () => Promise.resolve(),
      failure: () => '',
      onDone: go,
    });
  };

  return { ask, dialog: confirm.dialog };
}
