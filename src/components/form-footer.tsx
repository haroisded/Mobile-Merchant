import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useShellWide } from '../lib/columns';
import type { Notice } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { spacing } from '../themes';
import { Button } from './button';
import { HelperText } from './helper-text';
import { NoteCallout } from './note-callout';

/**
 * A full-page form's bottom bar, under PageForm: the save or offline notice above the buttons.
 *
 * SafeAreaView, not View: the Android build is edge-to-edge (android/gradle.properties), so a bar pinned
 * to the bottom draws behind the system navigation bar. `additive` adds the inset to the bar's own
 * padding.
 */
function FormFooter({ notice, children }: { notice: Notice | null; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView edges={['bottom']} style={[styles.footer, { borderTopColor: colors.outlineVariant, backgroundColor: colors.surface }]}>
      {notice ? (
        <HelperText type={notice.type} padding="none">
          {notice.text}
        </HelperText>
      ) : null}
      {children}
    </SafeAreaView>
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
  onSave: () => void;
  children: ReactNode;
};

/**
 * A full-page form — the Company and the Settings singles: its fields scroll above FormFooter's Save. Held
 * to the single-column measure, left-aligned (.claude/instruction_mds/frontend.md rule 18, §9).
 */
export function PageForm({ editable, readOnly, notice, mutation, dirty, onSave, children }: PageFormProps) {
  const wide = useShellWide();

  return (
    <>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {editable ? null : <NoteCallout>{`You can see this page. ${readOnly}`}</NoteCallout>}
        {children}
      </ScrollView>
      {editable ? (
        <FormFooter notice={notice}>
          <Button
            mode="contained"
            onPress={onSave}
            loading={mutation.isPending && !mutation.isPaused}
            disabled={mutation.isPending || !dirty}
            // Wide, the button hugs its label: a full-width primary button across a tablet reads as a banner.
            style={wide ? styles.hug : undefined}
            contentStyle={styles.leading}
          >
            Save
          </Button>
        </FormFooter>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing.sm, padding: spacing.ms, borderTopWidth: 1 },
  body: { gap: spacing.ms, padding: spacing.md, width: '100%', maxWidth: 720 },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  leading: { justifyContent: 'flex-start' },
  hug: { alignSelf: 'flex-start' },
});
