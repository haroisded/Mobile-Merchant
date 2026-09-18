import { useNavigation } from 'expo-router';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../lib/theme';
import { spacing } from '../themes';
import { Dialog } from './dialog';
import { Modal } from './modal';
import { Portal } from './portal';
import { Text } from './text';

type Props = {
  /** The shell's width decision (useShellWide), never measured here. Ignored when `inSheet`. */
  wide: boolean;
  /**
   * The content of a native formSheet route (src/app/(app)/sheets/). The OS draws the sheet's frame,
   * so this draws only what goes inside it.
   */
  inSheet?: boolean;
  onDismiss: () => void;
  /** False while a request is genuinely in flight, so the backdrop and back button cannot close it. */
  dismissable?: boolean;
  kicker?: string;
  /** `error` for a destructive confirm, `accent` otherwise (instruction_mds/visual-language.md §4). */
  kickerTone?: 'accent' | 'error';
  title: string;
  children?: ReactNode;
  /** Buttons. Laid out in a row when wide and stacked full width when narrow. */
  actions: ReactNode;
};

/**
 * A confirm or picker — the fifth pair in instruction_mds/layout.md §9, in three presentations:
 *
 * - **wide:** a Paper Dialog with a maximum width.
 * - **inSheet:** the body of a native formSheet route. Narrow confirms and inline-create dialogs open
 *   that way (instruction_mds/visual-language.md §5).
 * - **narrow, not in a sheet:** a Paper Modal on the bottom edge. Kept for the two exceptions that
 *   cannot be a route: the unsaved-changes prompt, which holds a navigation action the form blocked,
 *   and the iOS date/time picker.
 *
 * Mounted by its caller only while open, so every field inside starts empty with no reset logic.
 */
export function AdaptiveDialog({
  wide,
  inSheet,
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

  if (inSheet) {
    return (
      <SheetBody dismissable={dismissable} kicker={kicker} kickerColor={kickerColor} title={title} actions={actions}>
        {children}
      </SheetBody>
    );
  }

  if (wide) {
    return (
      <Portal>
        <Dialog
          visible
          onDismiss={onDismiss}
          dismissable={dismissable}
          dismissableBackButton={dismissable}
          // Dialog has no maximum width of its own (instruction_mds/layout.md rule 7).
          style={styles.dialog}
        >
          {kicker ? (
            <Text variant="labelMedium" style={[styles.dialogKicker, { color: kickerColor }]}>
              {kicker}
            </Text>
          ) : null}
          {/* No variant: Dialog.Title picks headlineSmall itself (instruction_mds/typography.md rule 5). Its own
              top margin is Paper's, not rhythm between siblings; under a kicker it closes up. */}
          <Dialog.Title style={kicker ? styles.titleUnderKicker : undefined}>{title}</Dialog.Title>
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
        contentContainerStyle={[styles.modalSheet, { backgroundColor: colors.surface, borderTopColor: colors.primary }]}
      >
        <SheetContent kicker={kicker} kickerColor={kickerColor} title={title} actions={actions}>
          {children}
        </SheetContent>
      </Modal>
    </Portal>
  );
}

type SheetProps = {
  kicker?: string;
  kickerColor: string;
  title: string;
  children?: ReactNode;
  actions: ReactNode;
};

/** Kicker, title, scrolling body and stacked actions — the inside of both narrow presentations. */
function SheetContent({ kicker, kickerColor, title, children, actions }: SheetProps) {
  const { colors } = useAppTheme();
  // A sheet reaches the bottom edge, so its last button would sit under the gesture bar. Neither
  // Paper's Modal nor the native formSheet pads for it.
  const { bottom } = useSafeAreaInsets();

  return (
    <>
      <View style={styles.sheetHeader}>
        {kicker ? (
          <Text variant="labelMedium" style={{ color: kickerColor }}>
            {kicker}
          </Text>
        ) : null}
        <Text variant="headlineSmall">{title}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View style={[styles.sheetActions, { borderTopColor: colors.outlineVariant, paddingBottom: spacing.md + bottom }]}>
        {actions}
      </View>
    </>
  );
}

/**
 * The formSheet route's body. Its own component because it needs hooks the other presentations do not.
 *
 * While a request is in flight the sheet should stay put, as `dismissable={false}` keeps a Dialog.
 * `gestureEnabled` stops the iOS swipe and the BackHandler listener stops Android's back button. What
 * nothing stops is Android's swipe-down and scrim tap: react-native-screens makes every Android
 * formSheet hideable and draggable (SheetDelegate.kt:190-191) and dismisses it natively. The request
 * then finishes on its own, and TanStack Query drops a `mutate` callback whose component unmounted, so
 * the sheet's `onSuccess` never navigates back from the screen underneath.
 *
 * `Portal.Host` scopes any Portal inside to the sheet: the root host sits behind a native sheet.
 */
function SheetBody({ dismissable, ...content }: SheetProps & { dismissable: boolean }) {
  const { colors } = useAppTheme();
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: dismissable });
    if (dismissable) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [navigation, dismissable]);

  return (
    <Portal.Host>
      <View style={[styles.routeSheet, { backgroundColor: colors.surface, borderTopColor: colors.primary }]}>
        <SheetContent {...content} />
      </View>
    </Portal.Host>
  );
}

const styles = StyleSheet.create({
  dialog: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  dialogKicker: { paddingHorizontal: spacing.lg, paddingTop: spacing.ml },
  titleUnderKicker: { marginTop: spacing.xs },
  // ScrollArea draws its own hairlines; the body pads itself instead.
  scrollArea: { paddingHorizontal: 0, borderTopWidth: 0, borderBottomWidth: 0, maxHeight: 460 },
  // Level with Dialog.Title's own 24 inset on the wide Dialog, and with the sheet's header on narrow.
  body: { gap: spacing.ms, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sheetBody: { gap: spacing.ms, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  sheetWrapper: { justifyContent: 'flex-end' },
  // The 2px primary rule on the sheet's top edge (instruction_mds/visual-language.md §5, confirm or picker narrow).
  modalSheet: { borderTopWidth: 2, maxHeight: '90%' },
  routeSheet: { borderTopWidth: 2 },
  sheetHeader: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  sheetActions: { gap: spacing.sm, padding: spacing.md, borderTopWidth: 1 },
});
