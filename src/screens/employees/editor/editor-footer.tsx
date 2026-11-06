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
  onDiscard: () => void;
  /** A saved role's. */
  onDeleteRole?: () => void;
};

/**
 * The Roles and Permissions editors' footer, as their mocks draw it: the save's notice, then — wide, on one row — Delete
 * Role at the start and Discard Changes before Save Changes; narrow, Delete Role and Discard Changes side by side over a
 * full-width Save Changes, within a thumb's reach.
 */
export function EditorFooter({ notice, mutation, dirty, saveable, onSave, onDiscard, onDeleteRole }: Props) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const half = wide ? undefined : styles.half;
  const others = (
    <>
      {onDeleteRole ? (
        <Button mode="outlined" textColor={colors.error} icon="delete" onPress={onDeleteRole} disabled={mutation.isPending} style={half}>
          Delete Role
        </Button>
      ) : null}
      {/* Delete Role at the start of the wide row, the rest at its end. */}
      {wide && onDeleteRole ? <View style={styles.spacer} /> : null}
      <Button mode="outlined" onPress={onDiscard} disabled={mutation.isPending || !dirty} style={half}>
        Discard Changes
      </Button>
    </>
  );
  const save = (
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
  );

  return (
    <FormFooter notice={notice}>
      {wide ? (
        <View style={styles.actions}>
          {others}
          {save}
        </View>
      ) : (
        <View style={styles.stack}>
          <View style={styles.pair}>{others}</View>
          {save}
        </View>
      )}
    </FormFooter>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  spacer: { flex: 1 },
  stack: { gap: spacing.sm },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  half: { flexGrow: 1 },
  leading: { justifyContent: 'flex-start' },
});
