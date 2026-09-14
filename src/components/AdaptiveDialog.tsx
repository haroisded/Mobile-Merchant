import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Dialog, Modal, Portal, Text } from 'react-native-paper';

import { useAppTheme } from '../lib/theme';

type Props = {
  /** The shell's width decision (useShellWide), never measured here. */
  wide: boolean;
  onDismiss: () => void;
  /** False while a request is genuinely in flight, so the backdrop and back button cannot close it. */
  dismissable?: boolean;
  kicker?: string;
  /** `error` for a destructive confirm, `accent` otherwise (docs/visual-language.md §4). */
  kickerTone?: 'accent' | 'error';
  title: string;
  children?: ReactNode;
  /** Buttons. Laid out in a row when wide and stacked full width when narrow. */
  actions: ReactNode;
};

/**
 * A confirm or picker: a Dialog on a wide shell, a bottom sheet on a narrow one — the fifth pair in
 * docs/layout.md §9. The first shared component in src/components/ (docs/structure.md rule 6): the
 * product form, the category manager and the three inline-create pickers all open one, across two
 * screens.
 *
 * Mounted by its caller only while open, like RemoveSystemDialog, so every field inside starts empty
 * with no reset logic.
 */
export function AdaptiveDialog({
  wide,
  onDismiss,
  dismissable = true,
  kicker,
  kickerTone = 'accent',
  title,
  children,
  actions,
}: Props) {
  const { colors } = useAppTheme();
  const kickerColor = kickerTone === 'error' ? colors.error : colors.accent;

  if (wide) {
    return (
      <Portal>
        <Dialog
          visible
          onDismiss={onDismiss}
          dismissable={dismissable}
          dismissableBackButton={dismissable}
          // Dialog has no maximum width of its own (docs/layout.md rule 7).
          style={styles.dialog}
        >
          {kicker ? (
            <Text variant="labelMedium" style={[styles.dialogKicker, { color: kickerColor }]}>
              {kicker}
            </Text>
          ) : null}
          {/* No variant: Dialog.Title picks headlineSmall itself (docs/typography.md rule 5). */}
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.ScrollArea style={styles.scrollArea}>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>{actions}</Dialog.Actions>
        </Dialog>
      </Portal>
    );
  }

  return (
    <Portal>
      <Modal
        visible
        onDismiss={onDismiss}
        dismissable={dismissable}
        dismissableBackButton={dismissable}
        // Paper's Modal centres its content (Modal.js wrapper: justifyContent 'center'); a sheet sits on
        // the bottom edge instead.
        style={styles.sheetWrapper}
        contentContainerStyle={[styles.sheet, { backgroundColor: colors.surface, borderTopColor: colors.primary }]}
      >
        <View style={styles.sheetHeader}>
          {kicker ? (
            <Text variant="labelMedium" style={{ color: kickerColor }}>
              {kicker}
            </Text>
          ) : null}
          <Text variant="headlineSmall">{title}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        <View style={[styles.sheetActions, { borderTopColor: colors.outlineVariant }]}>{actions}</View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  dialogKicker: { paddingHorizontal: 24, paddingTop: 20, marginBottom: -12 },
  // ScrollArea draws its own hairlines; the body pads itself instead.
  scrollArea: { paddingHorizontal: 0, borderTopWidth: 0, borderBottomWidth: 0, maxHeight: 460 },
  body: { gap: 12, paddingHorizontal: 24, paddingVertical: 8 },
  sheetWrapper: { justifyContent: 'flex-end' },
  // The 2px primary rule on the sheet's top edge (docs/visual-language.md §5, confirm or picker narrow).
  sheet: { borderTopWidth: 2, maxHeight: '90%' },
  sheetHeader: { gap: 4, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  sheetActions: { gap: 8, padding: 16, borderTopWidth: 1 },
});
