import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Button,
  Card,
  IconButton,
  Surface,
  Text,
  TouchableRipple,
} from 'react-native-paper';

import { CreateSystemModal } from '../../../features/merchants/CreateSystemModal';
import { useMerchantsQuery } from '../../../features/merchants/queries';
import type { Merchant } from '../../../features/merchants/queries';
import { RemoveSystemDialog } from '../../../features/merchants/RemoveSystemDialog';
import { SystemCard } from '../../../features/merchants/SystemCard';
import { useColumns } from '../../../lib/columns';

export default function Home() {
  const { columns, onLayout } = useColumns();
  const merchants = useMerchantsQuery();
  const [creating, setCreating] = useState(false);
  // The row awaiting confirmation, held here rather than in the card that opens it — a FlashList
  // cell is recycled, and this state must outlive neither the row nor the scroll position.
  const [removing, setRemoving] = useState<Merchant | null>(null);

  // The single width branch this screen makes. Everything downstream reads it rather than
  // re-deciding: one screen, one route, one measured branch (docs/layout.md §9).
  const narrow = columns === 1;

  const openAccount = () => router.navigate('/account');

  const header = narrow ? (
    <View style={styles.header}>
      <Text variant="titleMedium">Quick Actions</Text>
      <Button mode="contained" icon="plus" onPress={() => setCreating(true)}>
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
          are the same ones the narrow branch uses (docs/typography.md §4). */}
      <Card mode="contained" onPress={() => setCreating(true)}>
        <Card.Title
          title="Create New System"
          titleVariant="titleMedium"
          subtitle="Make your own point-of-sale system."
          subtitleVariant="bodySmall"
          left={(props) => <Avatar.Icon {...props} icon="plus" />}
        />
      </Card>
    </View>
  );

  return (
    <Surface style={styles.screen}>
      <Appbar.Header>
        {/* Tapping the avatar is the account affordance on a narrow container, where the mockup has
            no account action in the bar. Avatar.Icon takes no onPress of its own, so it is wrapped
            rather than given a raw touch handler — TouchableRipple is what gives it the platform's
            own press feedback and its accessibility role. */}
        <TouchableRipple onPress={openAccount} borderless style={styles.avatar}>
          <Avatar.Icon size={36} icon="account" />
        </TouchableRipple>
        <Appbar.Content title="Merchant" />
        {narrow ? (
          // Unticked in the Priority filter: renders, does nothing yet.
          <IconButton icon="magnify" />
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
          // required (docs/layout.md rule 4) is no longer load-bearing. It is kept because the
          // key only changes when the container crosses a column boundary — a rotation or a
          // resize, which is already a full relayout — and it costs nothing the rest of the time.
          key={columns}
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.empty}>
              {merchants.isPending ? (
                <ActivityIndicator />
              ) : merchants.isError ? (
                // retry is false by default, so nothing retries on its own — the user gets a result
                // and a control rather than a spinner that silently gives up (docs/data-layer.md §5).
                <View style={styles.state}>
                  <Text variant="bodyMedium">{merchants.error.message}</Text>
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
                onRemove={() => setRemoving(item)}
              />
            </View>
          )}
        />
      </View>

      {/* Mounted only while open, which is what makes the wizard's form and step counter fresh on
          every open with no reset logic. `stepped` is passed down because this screen has already
          measured; the modal must not measure itself to decide its own width. */}
      {creating ? (
        <CreateSystemModal stepped={narrow} onDismiss={() => setCreating(false)} />
      ) : null}

      {/* Mounted only while a row is awaiting confirmation, which is what makes the typed-
          confirmation field empty again on every open with no reset logic — the same reason the
          wizard above is mounted this way. */}
      {removing ? (
        <RemoveSystemDialog merchant={removing} onDismiss={() => setRemoving(null)} />
      ) : null}
    </Surface>
  );
}

// FlashList positions every cell absolutely, so neither `columnWrapperStyle` (it has no such prop)
// nor a flex `gap` on the content container reaches between cards. The spacing is carried by a
// 6-unit inset on each cell instead: 6 + 6 meets as the 12 between two cards, and 10 + 6 as the 16
// at the outer edge. Changing one of the three numbers below without the others moves the grid.
const GUTTER = 6;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1 },
  list: { padding: 16 - GUTTER },
  header: { gap: 12, padding: GUTTER },
  // No width and no height on the cell — FlashList sets the width from the column count, and
  // flex:1 lets the card fill the cell so neighbours in a row end up the same height.
  cell: { flex: 1, padding: GUTTER },
  empty: { padding: GUTTER },
  state: { gap: 12, alignItems: 'flex-start' },
  // Matches Avatar.Icon's size so the ripple is a circle rather than a square around it.
  avatar: { borderRadius: 18, marginLeft: 8 },
});
