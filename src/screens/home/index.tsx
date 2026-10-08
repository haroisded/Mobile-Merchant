import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { Appbar } from '../../components/appbar';
import { Avatar } from '../../components/avatar';
import { Button } from '../../components/button';
import { IconButton } from '../../components/icon-button';
import { RemoveSystemDialog } from '../../components/remove-system-dialog';
import { Surface } from '../../components/surface';
import { Text } from '../../components/text';
import { useMerchantsQuery } from '../../features/merchants/queries';
import type { Merchant } from '../../features/merchants/queries';
import { SYSTEM_CARD, useColumns, useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { useSession } from '../../Store/StoreUser';
import { spacing } from '../../themes';
import { CreateSystemCard } from './create-system-card';
import { SystemCard } from './system-card';

/** The wide grid's first cell, ahead of the systems. */
const CREATE = 'create';

export function HomeScreen() {
  const { columns, onLayout } = useColumns(SYSTEM_CARD);
  const merchants = useMerchantsQuery();
  // The list holds the systems this person owns and the ones they were invited to; only an owner removes.
  const userId = useSession()?.user.id;
  // The row awaiting confirmation, held here rather than in the card that opens it — a FlashList
  // cell is recycled, and this state must outlive neither the row nor the scroll position.
  const [removing, setRemoving] = useState<Merchant | null>(null);

  // The one threshold (.claude/instruction_mds/frontend.md §4.1) picks the anatomy: row cards narrow, grid
  // wide. The measured column count only sizes the grid.
  const narrow = !useShellWide();
  const numColumns = narrow ? 1 : columns;

  // Wide, the tab bar is hidden, so this is the only way to the Account tab. navigate, not push: the
  // tab is a sibling in the same tab navigator, so it switches tabs rather than stacking a second one.
  const openAccount = () => router.navigate('/account');

  // Creating is a full-screen route at every width, opened by a button narrow and by the grid's first
  // card wide. Removing is a formSheet route narrow and a dialog over this screen wide
  // (.claude/instruction_mds/frontend.md §5).
  const create = () => router.push('/create-system');
  const remove = (merchant: Merchant) => {
    if (narrow) router.push({ pathname: '/sheets/remove-system', params: { merchantId: merchant.id } });
    else setRemoving(merchant);
  };

  const systems = merchants.data ?? [];
  const cells: (Merchant | typeof CREATE)[] = narrow ? systems : [CREATE, ...systems];
  const status = <LoadStatus merchants={merchants} />;

  return (
    <Surface style={styles.screen}>
      <Appbar.Header>
        {/* The Merchant's logo, and nothing else: a brand mark is not a control, so it no longer
            opens the Account screen. That affordance is not lost — Account is the last tab on a
            narrow container and the bar's own action on a wide one.

            Blank because nothing in the schema carries a logo yet, and a blank logo has no features:
            no glyph, no initials. `Avatar.Text` with an empty label is Paper's own circle — avatars
            stay circular whatever the theme's roundness (.claude/instruction_mds/frontend.md rule 7).

            ponytail: swap to <Avatar.Image source={{ uri }} /> the day branding carries a logo. */}
        <View style={styles.logo}>
          {/* 40, MD3's avatar beside an app-bar title, and the rail's system badge. */}
          <Avatar.Text label="" size={40} />
        </View>
        <Appbar.Content title="Merchant" />
        {narrow ? (
          // Unticked in the Priority filter: renders, does nothing yet.
          <IconButton icon="search" />
        ) : (
          <>
            <Appbar.Action icon="bell" />
            <Appbar.Action icon="account-circle" onPress={openAccount} />
          </>
        )}
      </Appbar.Header>

      {/* onLayout goes on the element that actually constrains the cards — never on the screen and
          never on the window. This is what survives Stage Manager and split-screen. */}
      <View style={styles.body} onLayout={onLayout}>
        <FlashList
          data={cells}
          keyExtractor={(item) => (item === CREATE ? CREATE : item.id)}
          // Two recycling pools: the create card never recycles into a system card (vercel-react-native-skills
          // list-performance-item-types).
          getItemType={(item) => (item === CREATE ? CREATE : 'system')}
          numColumns={numColumns}
          // FlashList recomputes its layout when numColumns changes, so the remount FlatList
          // required (.claude/instruction_mds/frontend.md §4.2) is no longer load-bearing. It is kept because the
          // key only changes when the container crosses a column boundary — a rotation or a
          // resize, which is already a full relayout — and it costs nothing the rest of the time.
          key={numColumns}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<HomeHeader narrow={narrow} onCreate={create} />}
          // Narrow, the load state stands in for an empty list. Wide, the list is never empty — the
          // create card is always first — so the state goes under it, and the card is the empty state.
          ListEmptyComponent={narrow ? <View style={styles.empty}>{status}</View> : null}
          ListFooterComponent={narrow ? null : <View style={styles.empty}>{status}</View>}
          renderItem={({ item }) => (
            <View style={styles.cell}>
              {item === CREATE ? (
                <CreateSystemCard onPress={create} />
              ) : (
                <SystemCard
                  merchant={item}
                  row={narrow}
                  onPress={() => router.push({ pathname: '/systems/[id]', params: { id: item.id } })}
                  onRemove={() => remove(item)}
                  canRemove={item.owner_id === userId}
                />
              )}
            </View>
          )}
        />
      </View>

      {/* Mounted only while a row is awaiting confirmation, which is what makes the typed-
          confirmation field empty again on every open with no reset logic. */}
      {removing ? (
        <RemoveSystemDialog merchant={removing} onDismiss={() => setRemoving(null)} />
      ) : null}
    </Surface>
  );
}

/**
 * Narrow: a full-width create button between two headings. Wide: the screen's title and its line; the
 * grid's first card creates. The type does not grow with the window (.claude/instruction_mds/frontend.md rule 10);
 * a wider window gets more cards per row instead.
 */
function HomeHeader({ narrow, onCreate }: { narrow: boolean; onCreate: () => void }) {
  return narrow ? (
    <View style={styles.header}>
      <Text variant="titleMedium">Quick Actions</Text>
      <Button mode="contained" icon="add" onPress={onCreate} contentStyle={styles.leading}>
        Create New System
      </Button>
      <Text variant="titleMedium">Active Systems</Text>
    </View>
  ) : (
    <View style={styles.headerWide}>
      <Text variant="headlineMedium">Your POS Systems</Text>
      <Text variant="bodyLarge">Manage, edit, and monitor your custom point-of-sale system.</Text>
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
  const narrow = !useShellWide();

  if (merchants.isPaused) {
    return (
      <View style={styles.state}>
        <Text variant="bodyMedium">You&apos;re offline. Your systems will load when you reconnect.</Text>
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
        <Text variant="bodyMedium">{failureMessage("Couldn't load your systems. Try again.")}</Text>
        <Button onPress={() => merchants.refetch()}>Try again</Button>
      </View>
    );
  }
  // Wide, the create card already says there is nothing yet.
  return narrow ? <Text variant="bodyMedium">No systems yet.</Text> : null;
}

// FlashList positions every cell absolutely, so neither `columnWrapperStyle` (it has no such prop)
// nor a flex `gap` on the content container reaches between cards. The spacing is carried by a
// half-gap inset on each cell instead: `sm` + `sm` meets as the `md` between two cards, and `sm` of
// list padding + `sm` of cell inset makes the `md` at the outer edge. All three are GUTTER.
const GUTTER = spacing.sm;

const styles = StyleSheet.create({
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  leading: { justifyContent: 'flex-start' },
  screen: { flex: 1 },
  body: { flex: 1 },
  list: { padding: GUTTER },
  header: { gap: spacing.ms, padding: GUTTER },
  // Title and its line close together, and clear of the bar above and the cards below.
  headerWide: { gap: spacing.xs, paddingHorizontal: GUTTER, paddingTop: spacing.md, paddingBottom: spacing.md },
  // No width and no height on the cell — FlashList sets the width from the column count, and
  // flex:1 lets the card fill the cell so neighbours in a row end up the same height.
  cell: { flex: 1, padding: GUTTER },
  empty: { padding: GUTTER },
  state: { gap: spacing.ms, alignItems: 'flex-start' },
  // Insets from the bar's edge and from the title beside it — the circle is Avatar's own, not drawn
  // here. Paper spaces Appbar.Content only after its own action components, not after a View.
  logo: { paddingHorizontal: spacing.sm },
});
