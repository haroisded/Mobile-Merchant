import { router, useLocalSearchParams } from 'expo-router';
import Drawer from 'expo-router/drawer';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../../../components/activity-indicator';
import { Appbar } from '../../../../components/appbar';
import { Avatar } from '../../../../components/avatar';
import { BellAction } from '../../../../components/bell-action';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { Surface } from '../../../../components/surface';
import { Text } from '../../../../components/text';
import { useMerchantsQuery } from '../../../../features/merchants/queries';
import { showsDestination } from '../../../../features/permissions/access';
import type { DestinationRule } from '../../../../features/permissions/access';
import { usePermissions } from '../../../../features/role-permissions/queries';
import { useSystemSettingsQuery } from '../../../../features/system-settings/queries';
import { DRAWER_WIDTH, fontScaled, RAIL_COLLAPSED, RAIL_EXPANDED, useShellWide } from '../../../../lib/columns';
import { failureMessage } from '../../../../lib/errors';
import type { IconName } from '../../../../lib/icons';
import { useAppTheme } from '../../../../lib/theme';
import { ACCOUNTS_SECTIONS } from '../../../../screens/accounts';
import { SELL_SECTIONS } from '../../../../screens/sell';
import { SETUP_SECTIONS } from '../../../../screens/setup';
import { STOCK_SECTIONS } from '../../../../screens/stock';
import { useSession } from '../../../../Store/StoreUser';
import { radius, spacing } from '../../../../themes';

// The merchant shell: a header over an M3 NavigationRail on a wide window, or over an off-canvas
// drawer on a narrow one. Navigation is a
// layout, not a component (.claude/instruction_mds/structure.md rule 4), so every piece of the shell lives in this file.
//
// One expo-router Drawer serves both widths — drawerType 'permanent' is the rail, 'front' is the
// drawer — so the two share one route table and one destination list (.claude/instruction_mds/frontend.md §4.4).

// Who sees a destination (src/features/permissions/access.ts, showsDestination): `sections`, its index (the same
// list its screen draws), for someone who may open one of its rows; `permissions` for someone who holds one — the
// Dashboard's blocks, and Sell's session for a cashier who opens one without reading the list; `ownerOnly` for
// Employees. With none of them — Home — the item always shows.
type Destination = DestinationRule & { name: string; label: string; icon: IconName; stack?: boolean };

// Rail order. `name` is the route file or directory under this one; icons are the app's own names, drawn
// as each platform's symbol (src/lib/icons.tsx, .claude/instruction_mds/frontend.md §6). Stock is the items,
// their prices and their stock (./stock/); Accounts is the books every document posts to (./accounts/);
// Employees is who works here and what each may do (./employees/), the owner's alone; Setup is the company's
// foundation records (./setup/) — each a stack of its own. Sell is the Register and its sessions (./sell/).
// Dashboard is the numbers they add up to (./dashboard.tsx) — its own destination, not Home, which stays as it is.
const DESTINATIONS: Destination[] = [
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'dashboard', label: 'Dashboard', icon: 'dashboard', permissions: ['view_sales', 'view_shift_totals', 'close_any_register', 'view_stock'] },
  { name: 'sell', label: 'Sell', icon: 'sell', stack: true, sections: SELL_SECTIONS, permissions: ['open_close_register'] },
  { name: 'stock', label: 'Stock', icon: 'stock', stack: true, sections: STOCK_SECTIONS },
  { name: 'accounts', label: 'Accounts', icon: 'accounts', stack: true, sections: ACCOUNTS_SECTIONS },
  { name: 'employees', label: 'Employees', icon: 'group', stack: true, ownerOnly: true },
  { name: 'setup', label: 'Setup', icon: 'settings', stack: true, sections: SETUP_SECTIONS },
];

/** "Cafe 67" → "C6": the first letter of up to two words, for the store badge. */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

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

  if (!merchant) return <MissingMerchant merchants={merchants} />;

  // What the rail and the drawer list: a destination the person can read something in. The owner may read
  // everything and needs no my_permissions; a member sees Home until theirs arrive. Hidden is not refused —
  // every screen stays registered below, RLS decides, and an index says so when it has nothing to show.
  const isOwner = merchant.owner_id === userId;
  const shown = DESTINATIONS.filter((entry) => isOwner || showsDestination(entry, permissions.data));

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
          <SystemNav {...props} id={id} name={merchant.name} wide={wide} expanded={expanded} destinations={shown} />
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
      {/* Notifications are the person's, not this system's: the bell leaves the system for the tab, as the grid
          below does for Home. */}
      <BellAction color={colors.onPrimary} onPress={() => router.dismissTo('/notifications')} />
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
};

// Components B and C: the same header, divider and destinations, laid out as a rail when wide and as
// drawer rows when narrow. No system switcher — the way out of a system is the header's Your systems.
function SystemNav({ state, navigation, id, name, wide, expanded, destinations }: NavProps) {
  const { colors } = useAppTheme();
  const active = state.routes[state.index]?.name;
  // The drawer always shows labels; the rail shows them only while expanded.
  const labelled = !wide || expanded;

  return (
    <View>
      <View style={wide ? styles.systemRail : styles.systemDrawer}>
        <Avatar.Text size={40} label={initials(name)} color={colors.primary} style={{ backgroundColor: colors.onPrimary }} />
        {labelled ? (
          <View style={styles.systemText}>
            <Text variant="titleMedium" numberOfLines={1} style={{ color: colors.onPrimary }}>
              {name}
            </Text>
            {wide ? null : (
              <Text variant="bodySmall" style={[styles.subtitle, { color: colors.onPrimary }]}>
                POS store
              </Text>
            )}
          </View>
        ) : null}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.onPrimary }]} />

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
    </View>
  );
}

type ItemProps = {
  label: string;
  icon: IconName;
  wide: boolean;
  labelled: boolean;
  active?: boolean;
  onPress: () => void;
};

// One rail or drawer row. Active: the lightened ground and the 4px accent bar. Inactive: no ground, no
// bar, 68%. The bar is a left border on every item, transparent when inactive, so selecting an item
// never shifts its content sideways (.claude/instruction_mds/frontend.md §5).
function NavItem({ label, icon, wide, labelled, active, onPress }: ItemProps) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      // The drawer router closes the front drawer on any route change (DrawerRouter.js:114-119), so
      // tapping a destination needs no separate close call.
      onPress={onPress}
      // On `primary` the press colour is the same lightened ground the active item wears.
      android_ripple={{ color: colors.primaryHighlight }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[
        styles.item,
        active ? { backgroundColor: colors.primaryHighlight, borderLeftColor: colors.accent } : styles.inactive,
      ]}
    >
      <View style={wide ? styles.railItem : styles.drawerItem}>
        <Icon source={icon} size={wide ? 24 : 22} color={colors.onPrimary} />
        {labelled ? (
          <View style={styles.labelRow}>
            <Text
              variant="labelLarge"
              numberOfLines={1}
              style={[styles.fill, { color: colors.onPrimary }]}
            >
              {label}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
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
  systemRail: { alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md },
  systemDrawer: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, padding: spacing.md },
  systemText: { flexShrink: 1 },
  subtitle: { opacity: 0.7 },
  divider: { height: 1, opacity: 0.28 },
  items: { paddingTop: spacing.sm },
  // 4 of border plus `ms` of padding puts every icon `md` from the edge, level with the badge above.
  item: { borderLeftWidth: 4, borderLeftColor: 'transparent' },
  inactive: { opacity: 0.68 },
  // Stretch, not flex-start: the label row under the icon needs the rail's width, or its flex: 1
  // label measures to nothing and the rail shows icons only.
  railItem: { alignItems: 'stretch', gap: spacing.sm, paddingVertical: spacing.ms, paddingLeft: spacing.ms, paddingRight: spacing.ms },
  // flexGrow, not flex: 1 — under the rail's icon the item is a column, where flex: 1's zero basis
  // made the row zero tall and hid every label.
  labelRow: { flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexShrink: 1, minWidth: 0 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingLeft: spacing.ms, paddingRight: spacing.md },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.lg },
});
