import { router, useLocalSearchParams } from 'expo-router';
import Drawer from 'expo-router/drawer';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../../../components/activity-indicator';
import { Appbar } from '../../../../components/appbar';
import { BellAction } from '../../../../components/bell-action';
import { Button } from '../../../../components/button';
import { DESTINATIONS, menuOf } from '../../../../components/destinations';
import type { Destination } from '../../../../components/destinations';
import { NavItem, StoreBadge } from '../../../../components/shell-nav';
import { Surface } from '../../../../components/surface';
import { Text } from '../../../../components/text';
import { useHiddenFeatures } from '../../../../features/feature-preferences/queries';
import { useMerchantsQuery } from '../../../../features/merchants/queries';
import { usePermissions } from '../../../../features/role-permissions/queries';
import { useSystemSettingsQuery } from '../../../../features/system-settings/queries';
import { DRAWER_WIDTH, fontScaled, RAIL_COLLAPSED, RAIL_EXPANDED, useBottomInset, useShellWide } from '../../../../lib/columns';
import { failureMessage } from '../../../../lib/errors';
import { useAppTheme } from '../../../../lib/theme';
import { useSession } from '../../../../Store/StoreUser';
import { radius, spacing } from '../../../../themes';

// The merchant shell: a header over an M3 NavigationRail on a wide window, or over an off-canvas
// drawer on a narrow one. Navigation is a
// layout, not a component (.claude/instruction_mds/structure.md rule 4), so the shell lives in this file — all but its
// rail rows and store badge, which the Store Guide's practice store draws too (src/components/shell-nav.tsx).
//
// One expo-router Drawer serves both widths — drawerType 'permanent' is the rail, 'front' is the
// drawer — so the two share one route table and one destination list (.claude/instruction_mds/frontend.md §4.4).

// The destinations, who sees each and what the Features page hides: src/components/destinations.ts.

// dismissTo pops back to the systems list the anchor in (app)/_layout.tsx keeps under this screen,
// rather than pushing a second copy of it.
const exitSystem = () => router.dismissTo('/');

export default function SystemLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The same list the systems grid fetched, so arriving from a SystemCard is a cache hit and no
  // request goes out. A deep link fetches it once.
  const merchants = useMerchantsQuery();
  const merchant = merchants.data?.find((candidate) => candidate.id === id);
  const { colors } = useAppTheme();
  // The one width decision, made in (app)/_layout.tsx from the window (.claude/instruction_mds/frontend.md
  // §4.1). Every destination reads the same value, so the rail and the panes beside it flip together.
  const wide = useShellWide();
  // Only the rail collapses. The narrow drawer's open state belongs to the navigator instead.
  const [expanded, setExpanded] = useState(true);
  const userId = useSession()?.user.id;
  // The same query every index reads, so this adds no request of its own.
  const permissions = usePermissions({ merchantId: id });
  // Unused here: subscribing starts System Settings beside my_permissions when the system opens. The Dashboard
  // waits for its time zone, and money is formatted by it, so the first of those screens no longer asks for it
  // and only then for its own rows — one round trip less (.claude/test-report/backend-performance-test-report.md).
  useSystemSettingsQuery({ merchantId: id });
  // What this person hid here (the Features destination), else what the store's level hides. Nothing until it loads:
  // a destination appears, never vanishes.
  const hidden = useHiddenFeatures({ merchantId: id, level: merchant?.level });

  if (!merchant) return <MissingMerchant merchants={merchants} />;

  // What the rail and the drawer list: a destination the person can read something in. The owner may read
  // everything and needs no my_permissions; a member sees Home until theirs arrive. Hidden is not refused —
  // every screen stays registered below, RLS decides, and an index says so when it has nothing to show.
  const isOwner = merchant.owner_id === userId;
  // Then what the person chose to hide (src/features/feature-preferences/visibility.ts). Hidden is not refused
  // either: the screen stays registered, and only the menu leaves it out.
  const { shown, hiddenByChoice } = menuOf(isOwner, permissions.data, hidden);

  // The expanded rail grows with the font scale so its labels stay whole (fontScaled).
  const drawerWidth = wide ? (expanded ? fontScaled(RAIL_EXPANDED) : RAIL_COLLAPSED) : DRAWER_WIDTH;

  return (
    <View style={styles.fill}>
      <Drawer
        // `layout` wraps the navigator itself (react-navigation/core/types.d.ts:21), which is what
        // puts the header above the rail at full width, and makes the front drawer and its scrim
        // start under the header rather than over it. It is also the one place outside a screen
        // that holds the drawer's own navigation object, so the header's menu can toggle it.
        layout={({ children, navigation }) => (
          <View style={styles.fill}>
            <MerchantHeader
              onMenu={() => {
                if (wide) setExpanded((open) => !open);
                // DrawerActions is not a public export of expo-router; this is the action it builds,
                // handled at DrawerRouter.js:109.
                else navigation.dispatch({ type: 'TOGGLE_DRAWER' });
              }}
            />
            <View style={styles.fill}>{children}</View>
          </View>
        )}
        drawerContent={(props) => (
          <SystemNav {...props} id={id} name={merchant.name} wide={wide} expanded={expanded} destinations={shown} hiddenByChoice={hiddenByChoice} />
        )}
        screenOptions={{
          headerShown: false,
          drawerType: wide ? 'permanent' : 'front',
          drawerStyle: [wide ? styles.rail : styles.drawer, { backgroundColor: colors.primary, width: drawerWidth }],
          overlayColor: colors.backdrop,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        {DESTINATIONS.map((route) => (
          <Drawer.Screen key={route.name} name={route.name} />
        ))}
      </Drawer>
    </View>
  );
}

/** The shell before its merchant: loading, offline, failed, or gone. */
function MissingMerchant({ merchants }: { merchants: ReturnType<typeof useMerchantsQuery> }) {
  // The exit from every state below.
  const exit = (
    <Button mode="outlined" onPress={exitSystem}>
      Back to your stores
    </Button>
  );

  return (
    <ShellState>
      {/* Paused first: a query with no connection is queued, not failed, and isPending stays true
          the whole time, so checking isPending first would spin forever (.claude/instruction_mds/data-layer.md §5).
          No retry control on this branch — the query resumes on its own when the device
          reconnects. */}
      {merchants.isPaused ? (
        <>
          <Text variant="bodyMedium">You&apos;re offline. This store will load when you reconnect.</Text>
          {exit}
        </>
      ) : merchants.isPending ? (
        <ActivityIndicator />
      ) : merchants.isError ? (
        <>
          <Text variant="bodyMedium">{failureMessage("Couldn't load this store. Try again.")}</Text>
          <Button onPress={() => merchants.refetch()}>Try again</Button>
          {exit}
        </>
      ) : (
        // The list loaded and this id is not in it: deleted, owned by someone else (RLS returns no
        // row for another user's system), or never existed. All three read the same to a user.
        <>
          <Text variant="bodyMedium">This store is no longer available.</Text>
          {exit}
        </>
      )}
    </ShellState>
  );
}

type HeaderProps = {
  onMenu: () => void;
};

// Component A. Paper picks the title's variant (.claude/instruction_mds/frontend.md §3.3), so only colour is passed.
function MerchantHeader({ onMenu }: HeaderProps) {
  const { colors } = useAppTheme();

  return (
    <Appbar.Header style={{ backgroundColor: colors.primary }}>
      <Appbar.Action icon="menu" color={colors.onPrimary} onPress={onMenu} accessibilityLabel="Menu" />
      <Appbar.Content title="Merchant" color={colors.onPrimary} />
      {/* Notifications are the person's, not this store's: the bell pushes the inbox over the store, and Back
          returns here. */}
      <BellAction color={colors.onPrimary} onPress={() => router.push('/notifications')} />
      {/* The way out of a system. Not left to Back alone: on a phone the front drawer opens from a
          left-edge swipe, the same edge iOS pops a screen from, and iOS has no back button. */}
      <Appbar.Action icon="grid" color={colors.onPrimary} onPress={exitSystem} accessibilityLabel="Your stores" />
    </Appbar.Header>
  );
}

type StateProps = {
  children: ReactNode;
};

// What renders instead of the shell while there is no system to show. No rail or drawer: its
// destinations belong to a system, and there is none.
function ShellState({ children }: StateProps) {
  const { colors } = useAppTheme();

  return (
    <Surface style={styles.fill}>
      <Appbar.Header style={{ backgroundColor: colors.primary }}>
        <Appbar.Content title="Merchant" color={colors.onPrimary} />
      </Appbar.Header>
      <View style={styles.state}>{children}</View>
    </Surface>
  );
}

type NavProps = DrawerContentComponentProps & {
  id: string;
  name: string;
  wide: boolean;
  expanded: boolean;
  destinations: Destination[];
  /** The destinations the person may open but hid on the Features page; null until their choices load. */
  hiddenByChoice: string[] | null;
};

// Components B and C: the same header, divider and destinations, laid out as a rail when wide and as
// drawer rows when narrow. No system switcher — the way out of a system is the header's Your systems.
function SystemNav({ state, navigation, id, name, wide, expanded, destinations, hiddenByChoice }: NavProps) {
  const active = state.routes[state.index]?.name;
  // The screen the person is on, hidden from the Features page just now: back to Home, as its menu row went. Only
  // on that change — a deep link into a screen hidden earlier still lands, since hidden is not refused.
  // The choices as they first load are no change, so nothing moves until one is made.
  const hiddenKey = hiddenByChoice?.join(',') ?? null;
  const wasHidden = useRef<string[] | null>(null);
  useEffect(() => {
    if (hiddenKey === null) return;
    const now = hiddenKey ? hiddenKey.split(',') : [];
    const before = wasHidden.current;
    if (before && active && now.includes(active) && !before.includes(active)) navigation.navigate('index', { id });
    wasHidden.current = now;
  }, [hiddenKey, active, navigation, id]);
  // The drawer always shows labels; the rail shows them only while expanded.
  const labelled = !wide || expanded;
  // Scrolls, and ends above the navigation bar: eight rows and the badge outgrow a landscape tablet's height (~664dp
  // above three-button navigation), and a large font scale outgrows a phone's — Features, the last row, stays reachable.
  const bottom = useBottomInset();

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
      {/* Narrow only: on the rail the name stands alone. */}
      <StoreBadge name={name} line={wide ? undefined : 'POS store'} wide={wide} labelled={labelled} />

      <View style={styles.items}>
        {destinations.map((entry) => (
          <NavItem
            key={entry.name}
            label={entry.label}
            icon={entry.icon}
            wide={wide}
            labelled={labelled}
            active={entry.name === active}
            // A destination with a stack of its own opens at its first screen: tapping Setup from deep
            // inside Setup returns to its index, as a rail item should, rather than to wherever the
            // stack was left. `pop`: without it, React Navigation 7's NAVIGATE pushes a second index
            // over the pages above the first (StackRouter.js, 'NAVIGATE'). `params`: a screen gets only the
            // params passed here, so without `id` it reads no system at all — a stack's index, and a
            // destination that is one screen (the Dashboard drew nothing without it, emulator 2026-10-13).
            onPress={() =>
              entry.stack
                ? navigation.navigate(entry.name, { screen: 'index', params: { id }, pop: true })
                : navigation.navigate(entry.name, { id })
            }
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // react-navigation draws its own chrome on the drawer: a hairline right border in its theme's
  // `border` colour on the permanent rail, and 16-radius corners on the front drawer
  // (DrawerView.js:55, :184-206). `roundness` reaches Paper only, so both are set here from the theme:
  // the rail is chrome flush with the content beside it and keeps square edges, and the front drawer
  // takes the radius a Dialog-sized surface gets (.claude/instruction_mds/frontend.md rule 7).
  rail: { borderRightWidth: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  drawer: { borderRightWidth: 0, borderTopRightRadius: radius.xl, borderBottomRightRadius: radius.xl },
  items: { paddingTop: spacing.sm },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.lg },
});
