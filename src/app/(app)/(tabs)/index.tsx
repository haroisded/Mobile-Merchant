import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
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
import { SystemCard } from '../../../features/merchants/SystemCard';
import { useColumns } from '../../../lib/columns';

// A FlatList's final row stretches its items across the full width when it holds fewer than
// `numColumns` of them. Padding the data with blanks that render as an empty flex:1 View is the
// cheaper of the two fixes in docs/layout.md §3 — the other, flexBasis: `${100/columns}%`,
// overflows the row once `gap` is added to it.
function padToFullRows(rows: Merchant[], columns: number): (Merchant | null)[] {
  if (columns < 2 || rows.length === 0) return rows;
  const remainder = rows.length % columns;
  if (remainder === 0) return rows;
  return [...rows, ...Array<null>(columns - remainder).fill(null)];
}

export default function Home() {
  const { columns, onLayout } = useColumns();
  const merchants = useMerchantsQuery();
  const [creating, setCreating] = useState(false);

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
        <FlatList
          data={padToFullRows(merchants.data ?? [], columns)}
          keyExtractor={(item, index) => item?.id ?? `blank-${index}`}
          numColumns={columns}
          // Not optional: React Native throws on a numColumns change without a key change forcing
          // the remount (docs/layout.md rule 4).
          key={columns}
          // RN rejects columnWrapperStyle outright when numColumns is 1.
          columnWrapperStyle={columns > 1 ? styles.row : undefined}
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          ListEmptyComponent={
            merchants.isPending ? (
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
            )
          }
          renderItem={({ item }) =>
            item ? (
              <View style={styles.cell}>
                <SystemCard
                  merchant={item}
                  row={narrow}
                  onPress={() =>
                    router.push({ pathname: '/systems/[id]', params: { id: item.id } })
                  }
                />
              </View>
            ) : (
              // A padding blank. It holds a column open so the real cards keep their width.
              <View style={styles.cell} />
            )
          }
        />
      </View>

      {/* Mounted only while open, which is what makes the wizard's form and step counter fresh on
          every open with no reset logic. `stepped` is passed down because this screen has already
          measured; the modal must not measure itself to decide its own width. */}
      {creating ? (
        <CreateSystemModal stepped={narrow} onDismiss={() => setCreating(false)} />
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1 },
  list: { gap: 12, padding: 16 },
  header: { gap: 12 },
  row: { gap: 12 },
  // No width and no height on the cell — flex:1 inside a padded row is what makes the card's width
  // fall out of the column count.
  cell: { flex: 1 },
  state: { gap: 12, alignItems: 'flex-start' },
  // Matches Avatar.Icon's size so the ripple is a circle rather than a square around it.
  avatar: { borderRadius: 18, marginLeft: 8 },
});
