import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { Appbar } from '../../components/appbar';
import { Avatar } from '../../components/avatar';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { IconButton } from '../../components/icon-button';
import { RemoveSystemDialog } from '../../components/remove-system-dialog';
import { Surface } from '../../components/surface';
import { Text } from '../../components/text';
import { useMerchantsQuery } from '../../features/merchants/queries';
import type { Merchant } from '../../features/merchants/queries';
import { useColumns } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { spacing } from '../../themes';
import { CreateSystemModal } from './create-system';
import { SystemCard } from './system-card';

export function HomeScreen() {
  const { columns, onLayout } = useColumns();
  const merchants = useMerchantsQuery();
  const [creating, setCreating] = useState(false);
  // The row awaiting confirmation, held here rather than in the card that opens it — a FlashList
  // cell is recycled, and this state must outlive neither the row nor the scroll position.
  const [removing, setRemoving] = useState<Merchant | null>(null);

  // The single width branch this screen makes. Everything downstream reads it rather than
  // re-deciding: one screen, one route, one measured branch (instruction_mds/layout.md §9).
  const narrow = columns === 1;

  const openAccount = () => router.navigate('/account');

  // Narrow, creating is a full-screen route and removing is a formSheet route
  // (instruction_mds/visual-language.md §5); wide, both mount over this screen.
  const create = () => {
    if (narrow) router.push('/create-system');
    else setCreating(true);
  };
  const remove = (merchant: Merchant) => {
    if (narrow) router.push({ pathname: '/sheets/remove-system', params: { merchantId: merchant.id } });
    else setRemoving(merchant);
  };

  const header = narrow ? (
    <View style={styles.header}>
      <Text variant="titleMedium">Quick Actions</Text>
      <Button mode="contained" icon="add" onPress={create} contentStyle={styles.leading}>
        Create New System
      </Button>
      <Text variant="titleMedium">Active Systems</Text>
    </View>
  ) : (
    <View style={styles.header}>
      <Text variant="headlineSmall">Your POS Systems</Text>
      <Text variant="bodyMedium">Manage, edit, and monitor your custom point-of-sale system.</Text>
      {/* On a wide container the create action is promoted from a button to a full card. A
          hierarchy shift driven by available room, not by a type-scale swap — the variants below
          are the same ones the narrow branch uses (instruction_mds/typography.md §4). */}
      <Card mode="contained" onPress={create}>
        <Card.Title
          title="Create New System"
          titleVariant="titleMedium"
          subtitle="Make your own point-of-sale system."
          subtitleVariant="bodySmall"
          left={(props) => <Avatar.Icon {...props} icon="add" />}
        />
      </Card>
    </View>
  );

  return (
    <Surface style={styles.screen}>
      <Appbar.Header>
        {/* The Merchant's logo, and nothing else: a brand mark is not a control, so it no longer
            opens the Account screen. That affordance is not lost — Account is the last tab on a
            narrow container and the bar's own action on a wide one.

            Blank because nothing in the schema carries a logo yet, and a blank logo has no features:
            no glyph, no initials. `Avatar.Text` with an empty label is Paper's own circle — avatars
            stay circular whatever the theme's roundness (instruction_mds/visual-language.md rule 4).

            ponytail: swap to <Avatar.Image source={{ uri }} /> the day branding carries a logo. */}
        <View style={styles.logo}>
          <Avatar.Text label="" size={36} />
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
          data={merchants.data ?? []}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          // FlashList recomputes its layout when numColumns changes, so the remount FlatList
          // required (instruction_mds/layout.md rule 4) is no longer load-bearing. It is kept because the
          // key only changes when the container crosses a column boundary — a rotation or a
          // resize, which is already a full relayout — and it costs nothing the rest of the time.
          key={columns}
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.empty}>
              {/* Paused is checked FIRST because `isPending` is also true while paused, and the
                  spinner would win. networkMode: 'online' (the default, with onlineManager wired in
                  src/lib/query.ts) does not fail a query with no connection — it queues it, so
                  `isPending` never resolves and this screen would animate forever with nothing to
                  read and nothing to press. Verified on a device: uiautomator could not reach idle
                  offline, and dumped the instant the network came back.

                  No retry control, unlike the error branch below: a paused query resumes on its own
                  when onlineManager reports a connection, so a button here would offer to do what
                  is already going to happen. */}
              {merchants.isPaused ? (
                <View style={styles.state}>
                  <Text variant="bodyMedium">
                    You&apos;re offline. Your systems will load when you reconnect.
                  </Text>
                </View>
              ) : merchants.isPending ? (
                <ActivityIndicator />
              ) : merchants.isError ? (
                // retry is false by default, so nothing retries on its own — the user gets a result
                // and a control rather than a spinner that silently gives up (instruction_mds/data-layer.md §5).
                //
                // Copy written for the user, not `merchants.error.message`: this is the whole-screen
                // empty state, so a PostgREST string would be the most prominent text in the app on
                // a failed load. failureMessage swaps in the offline line when that is the cause.
                <View style={styles.state}>
                  <Text variant="bodyMedium">
                    {failureMessage("Couldn't load your systems. Try again.")}
                  </Text>
                  <Button onPress={() => merchants.refetch()}>Try again</Button>
                </View>
              ) : (
                <Text variant="bodyMedium">No systems yet.</Text>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <SystemCard
                merchant={item}
                row={narrow}
                onPress={() => router.push({ pathname: '/systems/[id]', params: { id: item.id } })}
                onRemove={() => remove(item)}
              />
            </View>
          )}
        />
      </View>

      {/* Mounted only while open, which is what makes the form fresh on every open with no reset
          logic. Wide only: narrow opens the same form as a route. */}
      {creating ? <CreateSystemModal onDismiss={() => setCreating(false)} /> : null}

      {/* Mounted only while a row is awaiting confirmation, which is what makes the typed-
          confirmation field empty again on every open with no reset logic — the same reason the
          wizard above is mounted this way. */}
      {removing ? (
        <RemoveSystemDialog merchant={removing} wide onDismiss={() => setRemoving(null)} />
      ) : null}
    </Surface>
  );
}

// FlashList positions every cell absolutely, so neither `columnWrapperStyle` (it has no such prop)
// nor a flex `gap` on the content container reaches between cards. The spacing is carried by a
// half-gap inset on each cell instead: `sm` + `sm` meets as the `md` between two cards, and `sm` of
// list padding + `sm` of cell inset makes the `md` at the outer edge. All three are GUTTER.
const GUTTER = spacing.sm;

const styles = StyleSheet.create({
  // Full-width buttons put their label at the left edge (instruction_mds/visual-language.md §5).
  leading: { justifyContent: 'flex-start' },
  screen: { flex: 1 },
  body: { flex: 1 },
  list: { padding: GUTTER },
  header: { gap: spacing.ms, padding: GUTTER },
  // No width and no height on the cell — FlashList sets the width from the column count, and
  // flex:1 lets the card fill the cell so neighbours in a row end up the same height.
  cell: { flex: 1, padding: GUTTER },
  empty: { padding: GUTTER },
  state: { gap: spacing.ms, alignItems: 'flex-start' },
  // Insets from the bar's edge and from the title beside it — the circle is Avatar's own, not drawn
  // here. Paper spaces Appbar.Content only after its own action components, not after a View.
  logo: { paddingHorizontal: spacing.sm },
});
