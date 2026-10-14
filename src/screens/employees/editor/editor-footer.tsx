import { StyleSheet, View } from 'react-native';

import { Button } from '../../../components/button';
import { FormFooter } from '../../../components/form-footer';
import { useShellWide } from '../../../lib/columns';
import type { Notice } from '../../../lib/errors';
import { useAppTheme } from '../../../lib/theme';
import { spacing } from '../../../themes';

type Props = {
  notice: Notice | null;
  /** The save's write: Save Changes spins while it is genuinely out. */
  mutation: { isPending: boolean; isPaused: boolean };
  dirty: boolean;
  /** Save Changes stays live on a new role, so a missing name is said rather than guessed at. */
  saveable: boolean;
  onSave: () => void;
  /** Wide only: Back discards on a phone. */
  onDiscard?: () => void;
  /** Wide only, a saved role's: the page header carries it on a phone. */
  onDeleteRole?: () => void;
};

/**
 * The Roles and Permissions editors' footer, as their mocks draw it: the save's notice, then — wide — Delete Role at
 * the start and Discard Changes before Save Changes; narrow, Save Changes alone.
 */
export function EditorFooter({ notice, mutation, dirty, saveable, onSave, onDiscard, onDeleteRole }: Props) {
  const { colors } = useAppTheme();
  const wide = useShellWide();

  return (
    <FormFooter notice={notice}>
      <View style={wide ? styles.actions : undefined}>
        {onDeleteRole ? (
          <Button mode="outlined" textColor={colors.error} icon="delete" onPress={onDeleteRole} disabled={mutation.isPending}>
            Delete Role
          </Button>
        ) : null}
        {/* Delete Role at the start of the row, the rest at its end. */}
        {onDeleteRole ? <View style={styles.spacer} /> : null}
        {onDiscard ? (
          <Button mode="outlined" onPress={onDiscard} disabled={mutation.isPending || !dirty}>
            Discard Changes
          </Button>
        ) : null}
        <Button
          mode="contained"
          onPress={onSave}
          loading={mutation.isPending && !mutation.isPaused}
          disabled={mutation.isPending || !saveable}
          // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
          contentStyle={styles.leading}
        >
          Save Changes
        </Button>
      </View>
    </FormFooter>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  spacer: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
