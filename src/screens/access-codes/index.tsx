import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Appbar } from '../../components/appbar';
import { Button } from '../../components/button';
import { SegmentedButtons } from '../../components/segmented-buttons';
import { Surface } from '../../components/surface';
import { Text } from '../../components/text';
import { useMerchantsQuery } from '../../features/merchants/queries';
import { fontScaled, useShellWide } from '../../lib/columns';
import { useSession } from '../../Store/StoreUser';
import { spacing } from '../../themes';
import { Codes } from './codes';
import { Members } from './members';
import { Requests } from './requests';

type Pane = 'codes' | 'requests' | 'members';

const PANES: { value: Pane; label: string }[] = [
  { value: 'codes', label: 'Codes' },
  { value: 'requests', label: 'Requests' },
  { value: 'members', label: 'Members' },
];
// The pane switch's narrowest width, as the Dashboard's period switch (frontend.md §5, Pane switch): three
// segments' own padding, plus three of the widest label — the segments are equal, "Requests" the widest — which
// grow with the font scale. 288 at the default size, inside a phone; past it the switch slides sideways. No count
// in a label: "Requests (3)" is cut off on a phone at the default size.
const SWITCH_PADDING = 96;
const SWITCH_LABELS = 192;

/**
 * Access Codes, outside any system like the systems list (.claude/updates-and-revamps/access-codes-references/):
 * the owner's codes, the requests they bring, and the people let in, across every system they own. A code is the
 * one way into someone else's system. The pane is the route's param, so a notification can open Requests.
 */
export function AccessCodesScreen() {
  const wide = useShellWide();
  const { pane = 'codes' } = useLocalSearchParams<{ pane?: Pane }>();
  const userId = useSession()?.user.id;
  const merchants = useMerchantsQuery();
  const owned = (merchants.data ?? []).filter((merchant) => merchant.owner_id === userId);
  // Elements, not mounted panes: only the one picked renders.
  const shown = { codes: <Codes owned={owned} />, requests: <Requests />, members: <Members /> }[pane];

  return (
    <Surface style={styles.screen}>
      <Appbar.Header>
        {/* Wide, the tab bar is hidden and the systems list's key icon opens this: back is the way home. */}
        {wide ? <Appbar.BackAction onPress={() => router.navigate('/')} /> : null}
        <Appbar.Content title="Access Codes" />
      </Appbar.Header>

      {merchants.data && owned.length === 0 ? (
        <NoSystems />
      ) : (
        <View style={styles.body}>
          <View style={[styles.switch, wide ? styles.switchWide : null]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.grow}>
              <SegmentedButtons
                value={pane}
                onValueChange={(next) => router.setParams({ pane: next })}
                buttons={PANES}
                style={[styles.grow, { minWidth: SWITCH_PADDING + fontScaled(SWITCH_LABELS) }]}
              />
            </ScrollView>
          </View>
          {shown}
        </View>
      )}
    </Surface>
  );
}

/** Someone who owns no store has no codes to make: what they can do is use one. */
function NoSystems() {
  return (
    <View style={styles.empty}>
      <Text variant="titleMedium">You don&apos;t own a store</Text>
      <Text variant="bodyMedium">
        Codes let people into a store you own. To join someone else&apos;s, enter the code its owner sent you.
      </Text>
      <Button mode="contained" icon="key" onPress={() => router.push('/forms/enter-access-code')}>
        Enter Access Code
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1 },
  switch: { paddingHorizontal: spacing.md, paddingTop: spacing.ms, paddingBottom: spacing.sm },
  grow: { flexGrow: 1 },
  // Wide, three segments at their labels' width would collapse (frontend.md §5, Pane switch): held to a
  // readable measure instead of the whole window.
  switchWide: { maxWidth: 560 },
  empty: { gap: spacing.ms, padding: spacing.md, alignItems: 'flex-start', maxWidth: 560 },
});
