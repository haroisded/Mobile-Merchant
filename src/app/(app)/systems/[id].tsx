import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Appbar, Surface, Text } from 'react-native-paper';

import { useMerchantsQuery } from '../../../features/merchants/queries';
import { CATEGORY_META } from '../../../features/merchants/schema';

// The destination for the ✅ "entire card is clickable → goes to Systems Page w/the selected
// system" interaction. A placeholder: the Systems Page proper is its own page with its own specs.
//
// It sits outside (tabs) so it pushes OVER the bottom bar instead of becoming a fifth tab.
export default function System() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // Reads the list the Home screen already fetched rather than firing a second query for one row.
  // Same query key, so this is a cache hit and no request goes out.
  const merchants = useMerchantsQuery();
  const merchant = merchants.data?.find((candidate) => candidate.id === id);

  return (
    <Surface style={styles.screen}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={merchant?.name ?? 'System'} />
      </Appbar.Header>
      <Surface style={styles.body} elevation={0}>
        {merchant ? (
          <>
            <Text variant="titleMedium">{CATEGORY_META[merchant.category].label}</Text>
            {merchant.description ? (
              <Text variant="bodyMedium">{merchant.description}</Text>
            ) : null}
          </>
        ) : (
          <Text variant="bodyMedium">This system is no longer available.</Text>
        )}
      </Surface>
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // A detail pane is single-column content, so it gets a maximum measure — without it the
  // description spans a 1000dp tablet and reads as broken (docs/layout.md rule 6).
  body: { flex: 1, gap: 12, padding: 24, maxWidth: 640, alignSelf: 'center', width: '100%' },
});
