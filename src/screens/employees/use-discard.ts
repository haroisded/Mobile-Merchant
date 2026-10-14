import { useConfirm } from '../../components/confirm-dialog';

/**
 * Ask before a pane drops unsaved changes — opening another role or employee beside the list. A Dialog: the panes
 * are a tablet's alone (.claude/instruction_mds/frontend.md §4.4).
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
