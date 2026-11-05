import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FORM_MEASURE, useBottomInset, useShellWide } from '../lib/columns';
import type { Notice } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { spacing } from '../themes';
import { Button } from './button';
import { HelperText } from './helper-text';
import { NoteCallout } from './note-callout';
import { useLeaveGuard } from './use-leave-guard';

/**
 * A full-page form's bottom bar, under PageForm: the save or offline notice above the buttons. The Register's
 * bar to its cart is one too (src/screens/register/index.tsx).
 *
 * Padded by the bottom inset: the Android build is edge-to-edge (android/gradle.properties), so a bar pinned
 * to the bottom draws behind the system navigation bar. The inset is read from context, not measured by a native
 * SafeAreaView, so a bar with another under it — a practice page above the Store Guide's bar — is given 0 there
 * (src/screens/guide/sandbox/index.tsx) instead of a gesture bar's gap above the bar below.
 */
export function FormFooter({ notice, children }: { notice: Notice | null; children: ReactNode }) {
  const { colors } = useAppTheme();
  const { bottom } = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: spacing.ms + bottom, borderTopColor: colors.outlineVariant, backgroundColor: colors.surface }]}>
      {/* Held to the form's measure, as the fields above it are: a notice across a tablet is a line no one reads. */}
      <View style={styles.measure}>
        <FormNotice notice={notice} />
        {children}
      </View>
    </View>
  );
}

function FormNotice({ notice }: { notice: Notice | null }) {
  return notice ? (
    <HelperText type={notice.type} padding="none">
      {notice.text}
    </HelperText>
  ) : null;
}

type PageFormProps = {
  /**
   * The page's header, handed the form's Save for its actions: wide it sits there, at the end of the title's row;
   * narrow `save` is null and the Save is in the footer.
   */
  header: (save: ReactNode) => ReactNode;
  /** False: the caller's roles may read this page but not write it — the fields are disabled, no Save. */
  editable: boolean;
  /** What the read-only note says ("Changing it needs System Settings write."). */
  readOnly: string;
  notice: Notice | null;
  /** The save's write: Save shows its spinner while genuinely out and stays disabled while pending at all. */
  mutation: { isPending: boolean; isPaused: boolean };
  /** Nothing to save until something changed. */
  dirty: boolean;
  /** Fields changed and not saved: leaving the page asks first (useLeaveGuard). A new record's `dirty` is always true. */
  unsaved?: boolean;
  onSave: () => void;
  /** The button's own words where the write is not a save: "Complete Order", "Open Session". */
  saveLabel?: string;
  children: ReactNode;
};

/**
 * A full-page form — the Store, the Settings singles, a record or a document: the standard page (the human, 2026-11-06;
 * .claude/instruction_mds/frontend.md §5) — the header across the pane, the fields from its left edge under it. Wide,
 * Save is in the header and the write's notice opens the fields, with no footer: a bar under a tablet's form held one
 * button. Narrow, FormFooter's Save stays under the fields, within a thumb's reach. With no Save (read-only), the end of
 * the fields keeps clear of the system navigation bar.
 *
 * KeyboardAvoidingView: the Android build is edge-to-edge, so the window does not resize for the keyboard
 * (adaptive-dialog.tsx), and React Native only reports the keyboard (ReactRootView.java) — nothing makes
 * room for it. Without it the keyboard lies over the end of the fields and over Save.
 */
export function PageForm({ header, editable, readOnly, notice, mutation, dirty, unsaved = false, onSave, saveLabel = 'Save', children }: PageFormProps) {
  const wide = useShellWide();
  const bottom = useBottomInset();
  const leaveGuard = useLeaveGuard(unsaved, mutation.isPending);
  const save = <SaveButton key="save" mutation={mutation} dirty={dirty} onSave={onSave} label={saveLabel} />;
  const inHeader = wide && editable;
  const inFooter = !wide && editable;

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      {leaveGuard}
      {header(inHeader ? save : null)}
      <ScrollView contentContainerStyle={[styles.body, inFooter ? null : { paddingBottom: spacing.md + bottom }]} keyboardShouldPersistTaps="handled">
        <ReadOnlyNote editable={editable} readOnly={readOnly} />
        {inHeader ? <FormNotice notice={notice} /> : null}
        {children}
      </ScrollView>
      {inFooter ? <FormFooter notice={notice}>{save}</FormFooter> : null}
    </KeyboardAvoidingView>
  );
}

function ReadOnlyNote({ editable, readOnly }: Pick<PageFormProps, 'editable' | 'readOnly'>) {
  return editable ? null : <NoteCallout>{`You can see this page. ${readOnly}`}</NoteCallout>;
}

type SaveButtonProps = Pick<PageFormProps, 'mutation' | 'dirty' | 'onSave'> & { label: string };

function SaveButton({ mutation, dirty, onSave, label }: SaveButtonProps) {
  return (
    <Button mode="contained" onPress={onSave} loading={mutation.isPending && !mutation.isPaused} disabled={mutation.isPending || !dirty} contentStyle={styles.leading}>
      {label}
    </Button>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Its sides pad as a form's body does, so the bar's content starts where the fields do.
  footer: { paddingTop: spacing.ms, paddingHorizontal: spacing.md, borderTopWidth: 1 },
  measure: { gap: spacing.sm, width: '100%', maxWidth: FORM_MEASURE },
  body: { gap: spacing.ms, padding: spacing.md },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  leading: { justifyContent: 'flex-start' },
});
