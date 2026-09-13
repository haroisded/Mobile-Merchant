import { router, useLocalSearchParams } from 'expo-router';
import Drawer from 'expo-router/drawer';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Avatar, Button, Icon, Surface, Text, TouchableRipple } from 'react-native-paper';

import { useMerchantsQuery } from '../../../../features/merchants/queries';
import { DRAWER_WIDTH, RAIL_COLLAPSED, RAIL_EXPANDED, WIDE_MIN, useColumns } from '../../../../lib/columns';
import { failureMessage } from '../../../../lib/errors';
import { useAppTheme } from '../../../../lib/theme';

// The merchant shell (System-Context/Merchant-Page, M3-Analysis/BottomNav-NavRail.md): a header over
// a NavigationRail on a wide container, or over an off-canvas drawer on a narrow one. Navigation is a
// layout, not a component (docs/structure.md rule 4), so every piece of the shell lives in this file.
//
// One expo-router Drawer serves both widths — drawerType 'permanent' is the rail, 'front' is the
// drawer — so the two share one route table and one destination list (docs/layout.md §9).

// Rail order. `name` is the route file under this directory; icons are Feather names except
// `calculator`, which Feather lacks and the root layout's renderer draws from MaterialCommunityIcons
// (docs/visual-language.md §6). An array rather than a lookup object, so matching the focused route is
// a plain comparison with no type assertion.
const DESTINATIONS = [
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'register', label: 'Register', icon: 'calculator' },
  { name: 'dashboard', label: 'Dashboard', icon: 'bar-chart-2' },
  { name: 'products', label: 'Products', icon: 'list' },
  { name: 'discounts', label: 'Discounts', icon: 'percent' },
  { name: 'employees', label: 'Employees', icon: 'users' },
  { name: 'features', label: 'Features', icon: 'toggle-right' },
  { name: 'audit', label: 'Audit', icon: 'clipboard' },
];

/** "Cafe 67" → "C6": the first letter of up to two words, for the system badge. */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export default function SystemLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The same list the systems grid fetched, so arriving from a SystemCard is a cache hit and no
  // request goes out. A deep link or a web reload fetches it once.
  const merchants = useMerchantsQuery();
  const merchant = merchants.data?.find((candidate) => candidate.id === id);
  const { colors } = useAppTheme();
  // The shell's one width decision. useColumns with WIDE_MIN as the "card" width yields a second
  // column exactly when the container reaches WIDE_MIN, so `columns > 1` reads as "wide". Measured
  // here, on the shell's root, and handed down — never re-measured by a screen under it, whose pane
  // is narrower by the rail and would flip at a different width (docs/layout.md §9).
  const { columns, onLayout } = useColumns(WIDE_MIN);
  const wide = columns > 1;
  // Only the rail collapses. The narrow drawer's open state belongs to the navigator instead.
  const [expanded, setExpanded] = useState(true);

  if (!merchant) {
    // The exit from every state below. dismissTo pops back to the systems list the anchor in
    // (app)/_layout.tsx keeps under this screen, rather than pushing a second copy of it.
    const exit = (
      <Button mode="outlined" onPress={() => router.dismissTo('/')}>
        Back to your systems
      </Button>
    );

    return (
      <ShellState>
        {/* Paused first: a query with no connection is queued, not failed, and isPending stays true
            the whole time, so checking isPending first would spin forever (docs/data-layer.md §5).
            No retry control on this branch — the query resumes on its own when the device
            reconnects. */}
        {merchants.isPaused ? (
          <>
            <Text variant="bodyMedium">You&apos;re offline. This system will load when you reconnect.</Text>
            {exit}
          </>
        ) : merchants.isPending ? (
          <ActivityIndicator />
        ) : merchants.isError ? (
          <>
            <Text variant="bodyMedium">{failureMessage("Couldn't load this system. Try again.")}</Text>
            <Button onPress={() => merchants.refetch()}>Try again</Button>
            {exit}
          </>
        ) : (
          // The list loaded and this id is not in it: deleted, owned by someone else (RLS returns no
          // row for another user's system), or never existed. All three read the same to a user.
          <>
            <Text variant="bodyMedium">This system is no longer available.</Text>
            {exit}
          </>
        )}
      </ShellState>
    );
  }

  const drawerWidth = wide ? (expanded ? RAIL_EXPANDED : RAIL_COLLAPSED) : DRAWER_WIDTH;

  return (
    <View style={styles.fill} onLayout={onLayout}>
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
          <SystemNav {...props} name={merchant.name} wide={wide} expanded={expanded} />
        )}
        screenOptions={{
          headerShown: false,
          drawerType: wide ? 'permanent' : 'front',
          drawerStyle: [styles.drawer, { backgroundColor: colors.primary, width: drawerWidth }],
          overlayColor: colors.backdrop,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        {DESTINATIONS.map((destination) => (
          <Drawer.Screen key={destination.name} name={destination.name} />
        ))}
      </Drawer>
    </View>
  );
}

type HeaderProps = {
  onMenu: () => void;
};

// Component A. Paper picks the title's variant (docs/typography.md rule 5), so only colour is passed.
function MerchantHeader({ onMenu }: HeaderProps) {
  const { colors } = useAppTheme();

  return (
    <Appbar.Header style={{ backgroundColor: colors.primary }}>
      <Appbar.Action icon="menu" color={colors.onPrimary} onPress={onMenu} accessibilityLabel="Menu" />
      <Appbar.Content title="Merchant" color={colors.onPrimary} />
      {/* Rendered, not wired: there is no notifications screen inside a system yet. */}
      <Appbar.Action icon="bell" color={colors.onPrimary} accessibilityLabel="Notifications" />
      <Appbar.Action
        icon="user"
        color={colors.onPrimary}
        // Pushed over the shell, so back returns here. Profile is also the way out of a system.
        onPress={() => router.push('/profile')}
        accessibilityLabel="Account"
      />
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
  name: string;
  wide: boolean;
  expanded: boolean;
};

// Components B and C: the same header, divider and eight destinations, laid out as a rail when wide
// and as drawer rows when narrow. No system switcher — the way out of a system is Profile.
function SystemNav({ state, navigation, name, wide, expanded }: NavProps) {
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
            <Text variant="titleMedium" numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ color: colors.onPrimary }}>
              {name}
            </Text>
            {wide ? null : (
              <Text variant="bodySmall" style={[styles.subtitle, { color: colors.onPrimary }]}>
                POS system
              </Text>
            )}
          </View>
        ) : null}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.onPrimary }]} />

      {DESTINATIONS.map((destination) => {
        const isActive = destination.name === active;
        return (
          <TouchableRipple
            key={destination.name}
            // The drawer router closes the front drawer on any route change (DrawerRouter.js:114-119),
            // so tapping a destination needs no separate close call.
            onPress={() => navigation.navigate(destination.name)}
            accessibilityRole="button"
            accessibilityLabel={destination.label}
            accessibilityState={{ selected: isActive }}
            // Active: the lightened ground and the 4px accent bar. Inactive: no ground, no bar, 68%.
            // The bar is a left border on every item, transparent when inactive, so selecting an item
            // never shifts its content sideways (docs/visual-language.md §4).
            style={[
              styles.item,
              isActive ? { backgroundColor: colors.primaryHighlight, borderLeftColor: colors.accent } : styles.inactive,
            ]}
          >
            <View style={wide ? styles.railItem : styles.drawerItem}>
              <Icon source={destination.icon} size={wide ? 24 : 22} color={colors.onPrimary} />
              {labelled ? (
                <Text variant="labelLarge" numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ color: colors.onPrimary }}>
                  {destination.label}
                </Text>
              ) : null}
            </View>
          </TouchableRipple>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // react-navigation draws its own chrome on the drawer: a hairline right border in its theme's
  // `border` colour on the permanent rail, and 16-radius corners on the front drawer
  // (DrawerView.js:55, :184-206). `roundness: 0` reaches Paper only, so both are zeroed here — the
  // one hand-set radius in the project, and it removes a corner rather than adding one.
  drawer: { borderRightWidth: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  systemRail: { alignItems: 'flex-start', gap: 8, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 18 },
  systemDrawer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16 },
  systemText: { flexShrink: 1 },
  subtitle: { opacity: 0.7 },
  divider: { height: 1, opacity: 0.28, marginBottom: 8 },
  // 4 of border plus 10 of padding keeps the icon at the mockup's 14 from the edge.
  item: { borderLeftWidth: 4, borderLeftColor: 'transparent' },
  inactive: { opacity: 0.68 },
  railItem: { alignItems: 'flex-start', gap: 7, paddingVertical: 13, paddingLeft: 10, paddingRight: 14 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 15, paddingLeft: 12, paddingRight: 16 },
  state: { gap: 12, alignItems: 'flex-start', padding: 24 },
});
