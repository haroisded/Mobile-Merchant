import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { Appbar } from '../../components/appbar';
import { Avatar } from '../../components/avatar';
import { BellAction } from '../../components/bell-action';
import { Button } from '../../components/button';
import { Icon } from '../../components/icon';
import { RemoveSystemDialog } from '../../components/remove-system-dialog';
import { Surface } from '../../components/surface';
import { Text } from '../../components/text';
import { useMerchantsQuery } from '../../features/merchants/queries';
import type { Merchant } from '../../features/merchants/queries';
import { SYSTEM_CARD, useBottomInset, useColumns, useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { useSession } from '../../Store/StoreUser';
import { radius, spacing } from '../../themes';
import { CreateCard } from './create-card';
import { PendingRequests } from './pending-requests';
import { SystemCard } from './system-card';

/** The list's first cell at every width, ahead of the stores. */
const CREATE = 'create';
type Cell = Merchant | typeof CREATE;

export function HomeScreen() {
  const { columns, onLayout } = useColumns(SYSTEM_CARD);
  const merchants = useMerchantsQuery();
  // The list holds the systems this person owns and the ones they were invited to; only an owner removes.
  const userId = useSession()?.user.id;
  // The rows awaiting confirmation, held here rather than in the card that opens it — a FlashList
  // cell is recycled, and this state must outlive neither the row nor the scroll position.
  const [removing, setRemoving] = useState<Merchant[] | null>(null);

  const narrow = !useShellWide();
  // The floating toolbar lies over the list's end: the last row scrolls clear of it and of the navigation bar.
  const bottom = useBottomInset(true);
  const [toolbar, setToolbar] = useState(0);

  const systems = merchants.data ?? [];
  const owned = systems.filter((merchant) => merchant.owner_id === userId);
  const { picked, setPicked, selected, selecting, toggle } = useSelection(owned);

  // Creating is a full-screen route at every width. Removing is a formSheet route narrow and a dialog over this
  // screen wide (.claude/instruction_mds/frontend.md §5); one store or several, the same confirm.
  const create = () => router.push('/create-system');
  const remove = (rows: Merchant[]) => {
    if (narrow) router.push({ pathname: '/sheets/remove-system', params: { merchantIds: rows.map((row) => row.id).join(',') } });
    else setRemoving(rows);
  };
  // While selecting, a tap on an owned store toggles it; a member's store, which cannot be selected, does nothing.
  const press = (merchant: Merchant) => {
    if (!selecting) router.push({ pathname: '/systems/[id]', params: { id: merchant.id } });
    else if (merchant.owner_id === userId) toggle(merchant.id);
  };

  const cells: Cell[] = [CREATE, ...systems];

  return (
    <Surface style={styles.screen}>
      {selecting ? (
        <SelectionBar
          count={selected.length}
          onClose={() => setPicked([])}
          onSelectAll={() => setPicked(owned.map((merchant) => merchant.id))}
          onDelete={() => remove(selected)}
        />
      ) : (
        <HomeBar narrow={narrow} />
      )}

      {/* onLayout goes on the element that actually constrains the cards — never on the screen and
          never on the window. This is what survives Stage Manager and split-screen. */}
      <View style={styles.body} onLayout={onLayout}>
        <FlashList
          data={cells}
          keyExtractor={(item) => (item === CREATE ? item : item.id)}
          // Two recycling pools: the create card never recycles into a store card (vercel-react-native-skills
          // list-performance-item-types).
          getItemType={(item) => (item === CREATE ? 'create' : 'system')}
          // The cards read the selection: a change of it redraws them.
          extraData={picked}
          numColumns={columns}
          // FlashList recomputes its layout when numColumns changes, so the remount FlatList
          // required (.claude/instruction_mds/frontend.md §4.2) is no longer load-bearing. It is kept because the
          // key only changes when the container crosses a column boundary — a rotation or a
          // resize, which is already a full relayout — and it costs nothing the rest of the time.
          key={columns}
          contentContainerStyle={[styles.list, { paddingBottom: GUTTER + toolbar + bottom }]}
          ListHeaderComponent={<HomeHeader />}
          // The create card is always first, so the list is never empty: the load state goes under it.
          ListFooterComponent={
            <View style={styles.empty}>
              <LoadStatus merchants={merchants} />
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.cell}>
              {item === CREATE ? (
                <CreateCard onPress={create} />
              ) : (
                <SystemCard
                  merchant={item}
                  onPress={() => press(item)}
                  onRemove={() => remove([item])}
                  canRemove={item.owner_id === userId}
                  selecting={selecting}
                  selected={picked.includes(item.id)}
                  onLongPress={() => toggle(item.id)}
                />
              )}
            </View>
          )}
        />
      </View>

      {/* Mounted only while rows are awaiting confirmation, which is what makes the typed-
          confirmation field empty again on every open with no reset logic. */}
      {removing ? <RemoveSystemDialog merchants={removing} onDismiss={() => setRemoving(null)} /> : null}
      {selecting ? null : <HomeToolbar bottom={bottom} onHeight={setToolbar} />}
    </Surface>
  );
}

/**
 * The multi-select over the stores this person owns: ids picked by a long press and then by taps. Read through
 * `owned`, so a store deleted or revoked meanwhile drops out by itself, and the selection ends when none is left.
 */
function useSelection(owned: Merchant[]) {
  const [picked, setPicked] = useState<string[]>([]);
  const selected = owned.filter((merchant) => picked.includes(merchant.id));
  const selecting = selected.length > 0;
  const toggle = (id: string) => setPicked((ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]));

  // Android's back leaves selection before it leaves the screen, as every list with a selection bar does.
  useEffect(() => {
    if (!selecting) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setPicked([]);
      return true;
    });
    return () => subscription.remove();
  }, [selecting]);

  return { picked, setPicked, selected, selecting, toggle };
}

type SelectionBarProps = { count: number; onClose: () => void; onSelectAll: () => void; onDelete: () => void };

/** The selection bar, in place of the header while stores are picked. */
function SelectionBar({ count, onClose, onSelectAll, onDelete }: SelectionBarProps) {
  const { colors } = useAppTheme();
  return (
    <Appbar.Header>
      <Appbar.Action icon="close" onPress={onClose} accessibilityLabel="Cancel selection" />
      <Appbar.Content title={`${count} selected`} />
      <Appbar.Action icon="select-all" onPress={onSelectAll} accessibilityLabel="Select all" />
      <Appbar.Action icon="delete" color={colors.error} onPress={onDelete} accessibilityLabel="Remove selected stores" />
    </Appbar.Header>
  );
}

/** The header: the logo and name, the bell and — wide, where the tab bar is hidden — Account. */
function HomeBar({ narrow }: { narrow: boolean }) {
  return (
    <Appbar.Header>
      {/* The Merchant's logo, and nothing else: a brand mark is not a control.

          Blank because nothing in the schema carries a logo yet, and a blank logo has no features:
          no glyph, no initials. `Avatar.Text` with an empty label is Paper's own circle — avatars
          stay circular whatever the theme's roundness (.claude/instruction_mds/frontend.md rule 7).

          ponytail: swap to <Avatar.Image source={{ uri }} /> the day branding carries a logo. */}
      <View style={styles.logo}>
        {/* 40, MD3's avatar beside an app-bar title, and the rail's system badge. */}
        <Avatar.Text label="" size={40} />
      </View>
      <Appbar.Content title="Merchant" />
      <BellAction onPress={() => router.push('/notifications')} />
      {/* Wide, the tab bar is hidden: Account opens as a Dialog over the stores (the forms/ profile route). */}
      {narrow ? null : <Appbar.Action icon="account-circle" onPress={() => router.push('/forms/profile')} accessibilityLabel="Account" />}
    </Appbar.Header>
  );
}

const TOOLS = [
  { icon: 'enter-code', label: 'Enter Code', accessibilityLabel: 'Enter Access Code', open: () => router.push('/forms/enter-access-code') },
  // navigate, not push: Access Codes is a sibling tab, hidden with the tab bar on a tablet.
  { icon: 'key', label: 'Access Codes', accessibilityLabel: 'Access Codes', wideOnly: true, open: () => router.navigate('/access-codes') },
  { icon: 'help', label: 'Store Guide', accessibilityLabel: 'Store Guide', open: () => router.push('/guide') },
] as const;

/**
 * Enter Access Code, Access Codes and the Store Guide, floating in a pill at the bottom centre over the stores (the
 * human, 2026-10-23), above the navigation bar. Narrow, Access Codes stays out: it is a tab of the bar under the pill
 * (the human, 2026-11-07). Its height is reported so the list's end scrolls clear.
 */
function HomeToolbar({ bottom, onHeight }: { bottom: number; onHeight: (height: number) => void }) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const tools = TOOLS.filter((tool) => wide || !('wideOnly' in tool));

  return (
    <View pointerEvents="box-none" style={[styles.toolbarWrap, { bottom: spacing.md + bottom }]}>
      <Surface
        elevation={2}
        style={[styles.toolbar, { borderColor: colors.outlineVariant }]}
        onLayout={(event) => onHeight(event.nativeEvent.layout.height + spacing.md)}
      >
        {tools.map((tool) => (
          <Pressable
            key={tool.label}
            onPress={tool.open}
            // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
            android_ripple={{ color: colors.ripple, borderless: true }}
            accessibilityRole="button"
            accessibilityLabel={tool.accessibilityLabel}
            style={styles.tool}
          >
            <Icon source={tool.icon} size={24} color={colors.onSurface} />
            <Text variant="labelSmall">{tool.label}</Text>
          </Pressable>
        ))}
      </Surface>
    </View>
  );
}

/**
 * The screen's title and its line, then the requests waiting. The type does not grow with the window
 * (.claude/instruction_mds/frontend.md rule 10); a wider window gets more cards per row instead.
 */
function HomeHeader() {
  return (
    <View style={styles.header}>
      <Text variant="headlineMedium">Your Stores</Text>
      <Text variant="bodyLarge">Manage and monitor each store&apos;s point of sale. Long-press a store to select several.</Text>
      <PendingRequests />
    </View>
  );
}

/**
 * The systems query's state while it has no rows to show. Paused is checked FIRST because `isPending`
 * is also true while paused, and the spinner would win. networkMode: 'online' (the default, with
 * onlineManager wired in src/lib/query.ts) does not fail a query with no connection — it queues it, so
 * `isPending` never resolves and this screen would animate forever with nothing to read and nothing to
 * press. Verified on a device: uiautomator could not reach idle offline, and dumped the instant the
 * network came back.
 *
 * No retry control while paused, unlike the error branch: a paused query resumes on its own when
 * onlineManager reports a connection, so a button would offer to do what is already going to happen.
 */
function LoadStatus({ merchants }: { merchants: ReturnType<typeof useMerchantsQuery> }) {
  if (merchants.isPaused) {
    return (
      <View style={styles.state}>
        <Text variant="bodyMedium">You&apos;re offline. Your stores will load when you reconnect.</Text>
      </View>
    );
  }
  if (merchants.isPending) return <ActivityIndicator />;
  if (merchants.isError) {
    // retry is false by default, so nothing retries on its own — the user gets a result and a control
    // rather than a spinner that silently gives up (.claude/instruction_mds/data-layer.md §5).
    //
    // Copy written for the user, not `merchants.error.message`: a PostgREST string would be the most
    // prominent text on the screen on a failed load. failureMessage swaps in the offline line when that
    // is the cause.
    return (
      <View style={styles.state}>
        <Text variant="bodyMedium">{failureMessage("Couldn't load your stores. Try again.")}</Text>
        <Button onPress={() => merchants.refetch()}>Try again</Button>
      </View>
    );
  }
  // The create card already says there is nothing yet.
  return null;
}

// FlashList positions every cell absolutely, so neither `columnWrapperStyle` (it has no such prop)
// nor a flex `gap` on the content container reaches between cards. The spacing is carried by a
// half-gap inset on each cell instead: `sm` + `sm` meets as the `md` between two cards, and `sm` of
// list padding + `sm` of cell inset makes the `md` at the outer edge. All three are GUTTER.
const GUTTER = spacing.sm;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1 },
  list: { padding: GUTTER },
  // Title and its line close together, and clear of the bar above and the cards below.
  header: { gap: spacing.xs, paddingHorizontal: GUTTER, paddingTop: spacing.md, paddingBottom: spacing.md },
  // No width and no height on the cell — FlashList sets the width from the column count, and
  // flex:1 lets the card fill the cell so neighbours in a row end up the same height.
  cell: { flex: 1, padding: GUTTER },
  empty: { padding: GUTTER },
  state: { gap: spacing.ms, alignItems: 'flex-start' },
  // Insets from the bar's edge and from the title beside it — the circle is Avatar's own, not drawn
  // here. Paper spaces Appbar.Content only after its own action components, not after a View.
  logo: { paddingHorizontal: spacing.sm },
  // A position over the list, not spacing between siblings.
  toolbarWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toolbar: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, borderRadius: radius.xl, borderCurve: 'continuous' },
  // A 48dp touch target at least (.claude/instruction_mds/frontend.md rule 19).
  tool: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minWidth: 88, minHeight: 56, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
});
