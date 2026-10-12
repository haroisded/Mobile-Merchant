import { router, useNavigation } from 'expo-router';

import { useShellWide } from '../lib/columns';
import { useAppTheme } from '../lib/theme';
import { Button } from './button';
import { useConfirm } from './confirm-dialog';
import { PageHeader } from './page-header';

type Props = {
  kicker: string;
  title: string;
  /** The confirmed delete of the saved record; absent for a new one, or when the reader's roles may not delete. */
  remove?: { title: string; body: string; run: () => Promise<void>; failure: (cause: Error | null) => string };
};

/**
 * The header of a record's own page in a destination's stack (an Item, a POS Profile): kicker, title, Back,
 * and the red Delete with its confirm (.claude/instruction_mds/frontend.md §5, "Record form with child rows").
 */
export function RecordPageHeader({ kicker, title, remove }: Props) {
  const { colors } = useAppTheme();
  const navigation = useNavigation();
  const wide = useShellWide();
  const confirm = useConfirm();

  const askDelete = (request: NonNullable<Props['remove']>) =>
    confirm.ask({
      ...request,
      confirmLabel: 'Delete',
      // The page pops through its own navigator, and on a phone the confirm's sheet of the outer stack pops too.
      // Rejected: router.dismissTo the list — from the sheet it pushed a second list over the deleted page.
      onDone: () => {
        navigation.goBack();
        if (!wide) router.back();
      },
    });

  return (
    <>
      <PageHeader
        kicker={kicker}
        title={title}
        onBack={() => router.back()}
        actions={
          remove ? (
            <Button mode="outlined" textColor={colors.error} icon="delete" onPress={() => askDelete(remove)}>
              Delete
            </Button>
          ) : null
        }
      />
      {confirm.dialog}
    </>
  );
}
