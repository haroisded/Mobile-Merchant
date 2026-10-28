import { useNavigation } from 'expo-router';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { BackHandler, KeyboardAvoidingView, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DIALOG_MAX, useShellWide } from '../lib/columns';
import type { Notice } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { spacing } from '../themes';
import { Button } from './button';
import { Dialog } from './dialog';
import { HelperText } from './helper-text';
import { IconButton } from './icon-button';
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
  /** The write's line above the buttons: an offline wait, or what went wrong (mutationNotice). */
  notice?: Notice | null;
  /** Buttons. Laid out in a row in the Dialog and stacked full width in a sheet or page. None: no footer at all. */
  actions?: ReactNode;
  /** A close X at the end of the header, for a list that closes with no footer (the Store Guide's role list). */
  onClose?: () => void;
  /**
   * False when the body scrolls itself — a picker's virtualized list (search-select.tsx). The body then sits in a
   * shrinking View instead of a ScrollView: a list inside a ScrollView renders every row and cannot scroll on its own.
   */
  scroll?: boolean;
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
  onClose,
  scroll = true,
}: Props) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const kickerColor = kickerTone === 'error' ? colors.error : colors.accent;

  if (inSheet || (asPage && !wide)) {
    return (
      <SheetBody
        page={!!asPage}
        dismissable={dismissable}
        kicker={kicker}
        kickerColor={kickerColor}
        title={title}
        notice={notice}
        actions={actions}
        onClose={onClose}
        scroll={scroll}
      >
        {body}
      </SheetBody>
    );
  }

  const dialog = (
    <WideDialog
      onDismiss={onDismiss}
      dismissable={dismissable}
      kicker={kicker}
      kickerColor={kickerColor}
      title={title}
      notice={notice}
      actions={actions}
      onClose={onClose}
      scroll={scroll}
    >
      {body}
    </WideDialog>
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
  scroll: boolean;
  kicker?: string;
  kickerColor: string;
  title: string;
  children?: ReactNode;
  notice?: Notice | null;
  actions?: ReactNode;
  /** The header's close X, drawn at its end. */
  onClose?: () => void;
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
type WideDialogProps = SheetProps & { onDismiss: () => void; dismissable: boolean };

/** The Paper Dialog: kicker, title, body and a row of buttons, held to a maximum width. */
function WideDialog({ onDismiss, dismissable, kicker, kickerColor, title, notice, actions, onClose, scroll, children }: WideDialogProps) {
  return (
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
        <Dialog.Title style={[kicker ? styles.titleUnderKicker : null, onClose ? styles.titleBesideClose : null]}>{title}</Dialog.Title>
        <View style={styles.dialogClose}>
          <CloseX onClose={onClose} />
        </View>
        <Dialog.ScrollArea style={styles.scrollArea}>
          <Body scroll={scroll} style={styles.body} fill={styles.fixedBody}>
            {children}
          </Body>
        </Dialog.ScrollArea>
        <NoticeLine notice={notice} style={styles.dialogNotice} />
        {/* A plain row, not Dialog.Actions: that clones `compact` onto each child, and the child here is
            the caller's Fragment. No actions: only the inset under the body. */}
        {actions ? <View style={styles.dialogActions}>{actions}</View> : <View style={styles.dialogEnd} />}
      </Dialog>
    </Portal>
  );
}

type BodyProps = { scroll: boolean; style: StyleProp<ViewStyle>; fill: StyleProp<ViewStyle>; scrollStyle?: StyleProp<ViewStyle>; children: ReactNode };

/** The body of a Dialog or sheet: a ScrollView, or a View taking the room left when the body scrolls itself. */
function Body({ scroll, style, fill, scrollStyle, children }: BodyProps) {
  return scroll ? (
    <ScrollView style={scrollStyle} contentContainerStyle={style} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[fill, style]}>{children}</View>
  );
}

function SheetBody({ page, dismissable, scroll, kicker, kickerColor, title, children, notice, actions, onClose }: SheetProps & { page: boolean; dismissable: boolean }) {
  const { colors } = useAppTheme();
  // A sheet or page reaches the bottom edge, so its last button would sit under the gesture bar. The
  // native formSheet does not pad for it, and neither does a page on the edge-to-edge Android build.
  const { top, bottom } = useSafeAreaInsets();
  useHoldRoute(dismissable);

  const content = (
    <>
      <View style={styles.sheetHeaderRow}>
        <View style={styles.sheetHeader}>
          {kicker ? (
            <Text variant="labelMedium" style={{ color: kickerColor }}>
              {kicker}
            </Text>
          ) : null}
          <Text variant="headlineSmall">{title}</Text>
        </View>
        <CloseX onClose={onClose} />
      </View>
      {/* Not scrolling, the sheet is held at the window's height (below), so the body fills it and the buttons stay at
          the bottom. */}
      <Body scroll={scroll} style={styles.sheetBody} fill={styles.sheetFill} scrollStyle={styles.sheetScroll}>
        {children}
      </Body>
      <SheetFooter notice={notice} actions={actions} bottom={bottom} borderColor={colors.outlineVariant} />
    </>
  );

  return (
    <Portal.Host>
      {page ? (
        <KeyboardAvoidingView behavior="padding" style={[styles.page, { backgroundColor: colors.surface, paddingTop: top }]}>
          <View style={styles.pageColumn}>{content}</View>
        </KeyboardAvoidingView>
      ) : (
        <RouteSheet scroll={scroll}>{content}</RouteSheet>
      )}
    </Portal.Host>
  );
}

/** The formSheet route's frame: held to the window's height, and making its own room for the keyboard. */
function RouteSheet({ scroll, children }: { scroll: boolean; children: ReactNode }) {
  const { colors } = useAppTheme();
  const { top } = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    // maxHeight: a fitToContents sheet is laid out at its content's full height, so a body taller than the
    // screen ran off the bottom with nothing to scroll. Held to the window, the ScrollView takes the rest.
    // A body that scrolls itself (a picker) is held AT the window's height instead: filtered down to a row or two
    // it would shrink to the bottom of the screen, under the keyboard its own search box raised (phone, 2026-10-22).
    <View style={[styles.routeSheet, scroll ? { maxHeight: height - top } : { height: height - top }, { backgroundColor: colors.surface, borderTopColor: colors.primary }]}>
      {/* A picker's sheet reaches the bottom of the screen, and the keyboard its Search box raises would lie over
          its buttons: the window does not resize for it (edge-to-edge), so the sheet makes the room itself. It shrinks
          with the sheet: unstyled, it grew to its content past the maxHeight, the ScrollView inside never had less
          room than its content, and the payment sheet's buttons sat under the navigation bar, out of reach (phone
          width, 2026-10-28). */}
      <KeyboardAvoidingView behavior="padding" style={scroll ? styles.sheetScroll : styles.sheetFill}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

/** The header's close X, when the caller closes from the header (`onClose`). */
function CloseX({ onClose }: { onClose?: () => void }) {
  return onClose ? <IconButton icon="close" onPress={onClose} accessibilityLabel="Close" /> : null;
}

type FooterProps = { notice?: Notice | null; actions?: ReactNode; bottom: number; borderColor: string };

/** A sheet's notice and stacked buttons over the gesture bar — or, with neither, only the room the gesture bar needs. */
function SheetFooter({ notice, actions, bottom, borderColor }: FooterProps) {
  if (!actions && !notice) return <View style={{ paddingBottom: spacing.sm + bottom }} />;
  return (
    <View style={[styles.sheetActions, { borderTopColor: borderColor, paddingBottom: spacing.md + bottom }]}>
      <NoticeLine notice={notice} />
      {actions}
    </View>
  );
}

/**
 * The write's notice, above the buttons as PageForm's footer has it. At the end of the scrolling body it was below the
 * fold: the payment's "Waiting for a connection" and "still to pay" showed only once scrolled to (phone, 2026-10-28).
 */
function NoticeLine({ notice, style }: { notice?: Notice | null; style?: StyleProp<ViewStyle> }) {
  if (!notice) return null;
  return (
    <View style={style}>
      <HelperText type={notice.type} padding="none">
        {notice.text}
      </HelperText>
    </View>
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
  sheetScroll: { flexShrink: 1 },
  sheetFill: { flex: 1 },
  // A body that scrolls itself: it shrinks to the Dialog's or the sheet's height, and its list takes the rest.
  fixedBody: { flexShrink: 1 },
  page: { flex: 1 },
  // Left-aligned measure, not a centred column (.claude/instruction_mds/frontend.md rule 18, §9).
  pageColumn: { flex: 1, width: '100%', maxWidth: DIALOG_MAX },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'flex-start' },
  sheetHeader: { flex: 1, gap: spacing.xs, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  // The close X at the Dialog's top right, beside the kicker and title; the title keeps clear of it.
  dialogClose: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  titleBesideClose: { marginRight: spacing.xxl },
  dialogEnd: { height: spacing.md },
  dialogNotice: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sheetActions: { gap: spacing.sm, padding: spacing.md, borderTopWidth: 1 },
});
