import { useNavigation } from 'expo-router';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { BackHandler, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DIALOG_MAX, useShellWide } from '../lib/columns';
import type { Notice } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { spacing } from '../themes';
import { Button } from './button';
import { Dialog } from './dialog';
import { HelperText } from './helper-text';
import { Portal } from './portal';
import { Text } from './text';

type Props = {
  /**
   * The content of a native formSheet route (src/app/(app)/sheets/). The OS draws the sheet's frame,
   * so this draws only what goes inside it.
   */
  inSheet?: boolean;
  /**
   * The content of a small-form route (src/app/(app)/forms/). Narrow, a full page; wide, a Dialog over
   * the screen it was opened from, the route being a transparentModal (src/app/(app)/_layout.tsx,
   * .claude/instruction_mds/frontend.md §4.4).
   */
  asPage?: boolean;
  onDismiss: () => void;
  /** False while a request is genuinely in flight, so the backdrop and back button cannot close it. */
  dismissable?: boolean;
  kicker?: string;
  /** `error` for a destructive confirm, `accent` otherwise (.claude/instruction_mds/frontend.md §2.3). */
  kickerTone?: 'accent' | 'error';
  title: string;
  children?: ReactNode;
  /** The write's line under the body: an offline wait, or what went wrong (mutationNotice). */
  notice?: Notice | null;
  /** Buttons. Laid out in a row in the Dialog and stacked full width in a sheet or page. */
  actions: ReactNode;
};

/**
 * A confirm, picker or small form — the pairs in .claude/instruction_mds/frontend.md §4.4, in four
 * presentations:
 *
 * - **Dialog:** a Paper Dialog with a maximum width, mounted by the screen that opened it.
 * - **inSheet:** the body of a native formSheet route. Narrow confirms and pickers open that way.
 * - **asPage, narrow:** the body of a full-page route — a small form on a phone.
 * - **asPage, wide:** the Dialog as the whole of a transparentModal route — that form on a tablet.
 *
 * Mounted by its caller only while open, so every field inside starts empty with no reset logic.
 */
export function AdaptiveDialog({
  inSheet,
  asPage,
  onDismiss,
  dismissable = true,
  kicker,
  kickerTone = 'accent',
  title,
  children: body,
  notice,
  actions,
}: Props) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const kickerColor = kickerTone === 'error' ? colors.error : colors.accent;
  const children = <WithNotice notice={notice}>{body}</WithNotice>;

  if (inSheet || (asPage && !wide)) {
    return (
      <SheetBody page={!!asPage} dismissable={dismissable} kicker={kicker} kickerColor={kickerColor} title={title} actions={actions}>
        {children}
      </SheetBody>
    );
  }

  const dialog = (
    <Portal>
      <Dialog
        visible
        onDismiss={onDismiss}
        dismissable={dismissable}
        dismissableBackButton={dismissable}
        // Dialog has no maximum width of its own (.claude/instruction_mds/frontend.md §7).
        style={styles.dialog}
      >
        {kicker ? (
          <Text variant="labelMedium" style={[styles.dialogKicker, { color: kickerColor }]}>
            {kicker}
          </Text>
        ) : null}
        {/* No variant: Dialog.Title picks headlineSmall itself (.claude/instruction_mds/frontend.md §3.3). Its own
            top margin is Paper's, not rhythm between siblings; under a kicker it closes up. */}
        <Dialog.Title style={kicker ? styles.titleUnderKicker : undefined}>{title}</Dialog.Title>
        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Dialog.ScrollArea>
        {/* A plain row, not Dialog.Actions: that clones `compact` onto each child, and the child here is
            the caller's Fragment. */}
        <View style={styles.dialogActions}>{actions}</View>
      </Dialog>
    </Portal>
  );

  return asPage ? <PageDialog dismissable={dismissable}>{dialog}</PageDialog> : dialog;
}

/**
 * A wide form route: a transparentModal whose whole content is the Dialog, so the screen it was opened
 * from shows under the backdrop.
 *
 * `Portal.Host` keeps the Dialog, and any confirm inside it, in this route: on iOS a modal is a view
 * controller of its own, above the root host. KeyboardAvoidingView shrinks the host as the keyboard
 * rises and the Dialog's maxHeight keeps its buttons above it — the Android build is edge-to-edge, so
 * the window does not resize for the keyboard.
 */
function PageDialog({ dismissable, children }: { dismissable: boolean; children: ReactNode }) {
  useHoldRoute(dismissable);

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.page}>
      <Portal.Host>{children}</Portal.Host>
    </KeyboardAvoidingView>
  );
}

/**
 * While a request is in flight a route should stay put, as `dismissable={false}` keeps a Dialog.
 * `gestureEnabled` stops the iOS swipe and the BackHandler listener stops Android's back button.
 */
function useHoldRoute(dismissable: boolean) {
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: dismissable });
    if (dismissable) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [navigation, dismissable]);
}

type SheetProps = {
  kicker?: string;
  kickerColor: string;
  title: string;
  children?: ReactNode;
  actions: ReactNode;
};

/**
 * The body of a formSheet or full-page route: kicker, title, scrolling body and stacked actions. A page
 * fills the screen under the status bar, its content held to the Dialog's width.
 *
 * While a request is in flight the sheet holds still (useHoldRoute). What nothing stops is Android's
 * swipe-down and scrim tap: react-native-screens makes every Android
 * formSheet hideable and draggable (SheetDelegate.kt:190-191) and dismisses it natively. The request
 * then finishes on its own, and TanStack Query drops a `mutate` callback whose component unmounted, so
 * the sheet's `onSuccess` never navigates back from the screen underneath.
 *
 * `Portal.Host` scopes any Portal inside to the sheet or page: the root host sits behind a native sheet.
 */
function SheetBody({ page, dismissable, kicker, kickerColor, title, children, actions }: SheetProps & { page: boolean; dismissable: boolean }) {
  const { colors } = useAppTheme();
  // A sheet or page reaches the bottom edge, so its last button would sit under the gesture bar. The
  // native formSheet does not pad for it, and neither does a page on the edge-to-edge Android build.
  const { top, bottom } = useSafeAreaInsets();
  useHoldRoute(dismissable);

  const content = (
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

  return (
    <Portal.Host>
      {page ? (
        <KeyboardAvoidingView behavior="padding" style={[styles.page, { backgroundColor: colors.surface, paddingTop: top }]}>
          <View style={styles.pageColumn}>{content}</View>
        </KeyboardAvoidingView>
      ) : (
        <View style={[styles.routeSheet, { backgroundColor: colors.surface, borderTopColor: colors.primary }]}>{content}</View>
      )}
    </Portal.Host>
  );
}

/** The body, then the write's notice line — reserved only when the caller passes a notice slot. */
function WithNotice({ notice, children }: { notice: Notice | null | undefined; children: ReactNode }) {
  if (notice === undefined) return children;
  return (
    <>
      {children}
      <HelperText type={notice?.type ?? 'error'} visible={notice !== null} padding="none">
        {notice?.text}
      </HelperText>
    </>
  );
}

/**
 * A form's submit handler: write once, then `onDone` with what was saved — close a small form, or reset a
 * page form to its new values. Refused while the write is pending, paused included: a keyboard's Done
 * submits too, and a second write would queue behind the first (.claude/instruction_mds/data-layer.md §5).
 * Pass it to react-hook-form's handleSubmit.
 *
 * `isPending` alone is not enough: it is the value from the render this handler was made in, so two taps
 * landing before the next render both read false and both write. `sent` closes that gap for the handler
 * the taps share; the render after the first write hands out a new handler that reads `isPending` true.
 */
export function saveOnce<V>(
  mutation: { isPending: boolean; mutate: (values: V, options: { onSuccess: () => void }) => void },
  onDone: (values: V) => void
) {
  let sent = false;
  return (values: V) => {
    if (sent || mutation.isPending) return;
    sent = true;
    mutation.mutate(values, { onSuccess: () => onDone(values) });
  };
}

/**
 * saveOnce for a write whose answer the caller goes on with — the id of the sale a checkout made, of the
 * closing entry a closed session left. The same guard, for the same reason.
 */
export function sendOnce<V, D>(mutation: { isPending: boolean; mutate: (values: V, options: { onSuccess: (data: D) => void }) => void }, onDone: (data: D) => void) {
  let sent = false;
  return (values: V) => {
    if (sent || mutation.isPending) return;
    sent = true;
    mutation.mutate(values, { onSuccess: onDone });
  };
}

type ActionsProps = {
  /** The form's write: Cancel locks while it is genuinely out, Save while it is pending at all. */
  mutation: { isPending: boolean; isPaused: boolean };
  onCancel: () => void;
  /** Absent: the caller may only read this record, so there is no Save and Cancel reads Close. */
  onSave?: () => void;
  saveLabel?: string;
  /** Absent for a new record, or without the delete permission. */
  onDelete?: () => void;
  /** Delete's own word where it is not a delete: an access request's Decline. */
  deleteLabel?: string;
};

/**
 * A small form's buttons: Delete in `error`, then Cancel and Save. A paused (offline) save is not in flight,
 * but Save stays disabled while it waits, so a second tap cannot queue a second write
 * (.claude/instruction_mds/data-layer.md §5).
 */
export function FormActions({ mutation, onCancel, onSave, saveLabel = 'Save', onDelete, deleteLabel = 'Delete' }: ActionsProps) {
  const { colors } = useAppTheme();
  const inFlight = mutation.isPending && !mutation.isPaused;

  return (
    <>
      {onDelete ? (
        <Button mode="text" textColor={colors.error} onPress={onDelete} disabled={inFlight} contentStyle={styles.action}>
          {deleteLabel}
        </Button>
      ) : null}
      <Button mode="outlined" onPress={onCancel} disabled={inFlight} contentStyle={styles.action}>
        {onSave ? 'Cancel' : 'Close'}
      </Button>
      {onSave ? (
        <Button mode="contained" onPress={onSave} loading={inFlight} disabled={mutation.isPending} contentStyle={styles.action}>
          {saveLabel}
        </Button>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  action: { justifyContent: 'flex-start' },
  // maxHeight: over a form route the rising keyboard shrinks the space the Dialog is centred in.
  dialog: { maxWidth: DIALOG_MAX, width: '100%', maxHeight: '90%', alignSelf: 'center' },
  dialogKicker: { paddingHorizontal: spacing.lg, paddingTop: spacing.ml },
  titleUnderKicker: { marginTop: spacing.xs },
  // ScrollArea draws its own hairlines; the body pads itself instead. flexShrink: the body gives up
  // height first, so the title and buttons stay in view.
  scrollArea: { paddingHorizontal: 0, borderTopWidth: 0, borderBottomWidth: 0, maxHeight: 460, flexShrink: 1 },
  // Level with Dialog.Title's own 24 inset on the wide Dialog, and with the sheet's header on narrow.
  body: { gap: spacing.ms, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  // Dialog.Actions' own MD3 layout: buttons at the end, inset level with the title.
  dialogActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetBody: { gap: spacing.ms, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  // The 2px primary rule on the sheet's top edge (.claude/instruction_mds/frontend.md §5).
  routeSheet: { borderTopWidth: 2 },
  page: { flex: 1 },
  // Left-aligned measure, not a centred column (.claude/instruction_mds/frontend.md rule 18, §9).
  pageColumn: { flex: 1, width: '100%', maxWidth: DIALOG_MAX },
  sheetHeader: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  sheetActions: { gap: spacing.sm, padding: spacing.md, borderTopWidth: 1 },
});
