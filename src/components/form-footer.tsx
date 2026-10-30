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
 *
 * `centered`: under a PageForm, whose column is centred on a tablet — the bar's content lines up with the fields.
 */
export function FormFooter({ notice, centered = false, children }: { notice: Notice | null; centered?: boolean; children: ReactNode }) {
  const { colors } = useAppTheme();
  const { bottom } = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: spacing.ms + bottom, borderTopColor: colors.outlineVariant, backgroundColor: colors.surface }]}>
      {/* Held to the form's measure, as the fields above it are: a notice across a tablet is a line no one reads. */}
      <View style={centered ? styles.centred : styles.measure}>
        {notice ? (
          <HelperText type={notice.type} padding="none">
            {notice.text}
          </HelperText>
        ) : null}
        {children}
      </View>
    </View>
  );
}

type PageFormProps = {
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
 * A full-page form — the Company and the Settings singles: its fields scroll above FormFooter's Save. Held
 * to the single-column measure, the column centred in a pane wider than it — a tablet's — with its page header
 * (PageHeader `form`) and its Save (the human, 2026-10-23; .claude/instruction_mds/frontend.md rule 18). With no
 * Save (read-only), the end of the fields keeps clear of the system navigation bar.
 *
 * KeyboardAvoidingView: the Android build is edge-to-edge, so the window does not resize for the keyboard
 * (adaptive-dialog.tsx), and React Native only reports the keyboard (ReactRootView.java) — nothing makes
 * room for it. Without it the keyboard lies over the end of the fields and over Save.
 */
export function PageForm({ editable, readOnly, notice, mutation, dirty, unsaved = false, onSave, saveLabel = 'Save', children }: PageFormProps) {
  const wide = useShellWide();
  const bottom = useBottomInset();
  const leaveGuard = useLeaveGuard(unsaved, mutation.isPending);

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      {leaveGuard}
      <ScrollView contentContainerStyle={[styles.body, editable ? null : { paddingBottom: spacing.md + bottom }]} keyboardShouldPersistTaps="handled">
        {editable ? null : <NoteCallout>{`You can see this page. ${readOnly}`}</NoteCallout>}
        {children}
      </ScrollView>
      {editable ? (
        <FormFooter notice={notice} centered>
          <Button
            mode="contained"
            onPress={onSave}
            loading={mutation.isPending && !mutation.isPaused}
            disabled={mutation.isPending || !dirty}
            // Wide, the button hugs its label: a full-width primary button across a tablet reads as a banner.
            style={wide ? styles.hug : undefined}
            contentStyle={styles.leading}
          >
            {saveLabel}
          </Button>
        </FormFooter>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Its sides pad as a form's body does, so the bar's content starts where the fields do.
  footer: { paddingTop: spacing.ms, paddingHorizontal: spacing.md, borderTopWidth: 1 },
  measure: { gap: spacing.sm, width: '100%', maxWidth: FORM_MEASURE },
  // The body's content width (FORM_MEASURE less its padding), centred as the body is.
  centred: { gap: spacing.sm, width: '100%', maxWidth: FORM_MEASURE - 2 * spacing.md, alignSelf: 'center' },
  body: { gap: spacing.ms, padding: spacing.md, width: '100%', maxWidth: FORM_MEASURE, alignSelf: 'center' },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  leading: { justifyContent: 'flex-start' },
  hug: { alignSelf: 'flex-start' },
});
