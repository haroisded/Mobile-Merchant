import { router, useLocalSearchParams } from 'expo-router';
import Drawer from 'expo-router/drawer';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { use, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../../../components/activity-indicator';
import { Appbar } from '../../../../components/appbar';
import { Avatar } from '../../../../components/avatar';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { Surface } from '../../../../components/surface';
import { Text } from '../../../../components/text';
import { ShellMerchantContext, useMerchantsQuery } from '../../../../features/merchants/queries';
import { DRAWER_WIDTH, RAIL_COLLAPSED, RAIL_EXPANDED, ShellWideContext, WIDE_MIN, useColumns } from '../../../../lib/columns';
import { failureMessage } from '../../../../lib/errors';
import type { IconName } from '../../../../lib/icons';
import { useAppTheme } from '../../../../lib/theme';
import { UnsavedGuardContext } from '../../../../lib/unsaved-guard';
import type { LeaveGuard } from '../../../../lib/unsaved-guard';
import { radius, spacing } from '../../../../themes';

// The merchant shell (System-Context/Merchant-Page, M3-Analysis/BottomNav-NavRail.md): a header over
// a NavigationRail on a wide container, or over an off-canvas drawer on a narrow one. Navigation is a
// layout, not a component (instruction_mds/structure.md rule 4), so every piece of the shell lives in this file.
//
// One expo-router Drawer serves both widths — drawerType 'permanent' is the rail, 'front' is the
// drawer — so the two share one route table and one destination list (instruction_mds/layout.md §9).

type Destination = { name: string; label: string; icon: IconName };

// The three Resources screens. One catalogue split by what a merchant is looking
// at: things sold as a line, things rented or booked, and things counted on a shelf.
const RESOURCES: Destination[] = [
  { name: 'products', label: 'Products', icon: 'list' },
  { name: 'rentables', label: 'Rentables', icon: 'key' },
  { name: 'inventory', label: 'Inventory', icon: 'inventory' },
];

// Rail order. `name` is the route file under this directory; icons are the app's own names, drawn as
// each platform's symbol (src/lib/icons.tsx, instruction_mds/visual-language.md §6). An array rather than a lookup
// object, so matching the focused route is a plain comparison with no type assertion.
//
// Resources is the one row that is not a destination: it has no route and navigates nowhere, it only
// shows and hides the three screens under it.
const DESTINATIONS: (Destination | { group: 'resources'; label: string; icon: IconName })[] = [
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'register', label: 'Register', icon: 'calculator' },
  { name: 'dashboard', label: 'Dashboard', icon: 'bar-chart' },
  { group: 'resources', label: 'Resources', icon: 'layers' },
  { name: 'discounts', label: 'Discounts', icon: 'percent' },
  { name: 'employees', label: 'Employees', icon: 'users' },
  { name: 'features', label: 'Features', icon: 'toggle' },
  { name: 'audit', label: 'Audit', icon: 'clipboard' },
];

/** Every route the drawer navigator holds: the rail's own destinations plus the three Resources. */
const ROUTES: Destination[] = [
  // A predicate, not a plain filter: `!('group' in entry)` does not narrow the array's element type.
  ...DESTINATIONS.filter((entry): entry is Destination => !('group' in entry)),
  ...RESOURCES,
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
  // is narrower by the rail and would flip at a different width (instruction_mds/layout.md §9).
  const { columns, onLayout } = useColumns(WIDE_MIN);
  const wide = columns > 1;
  // Only the rail collapses. The narrow drawer's open state belongs to the navigator instead.
  const [expanded, setExpanded] = useState(true);
  // Filled by a destination with unsaved changes (the product form); the rail asks it before
  // switching destination. See src/lib/unsaved-guard.ts.
  const leaveGuard = useRef<LeaveGuard | null>(null);

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
            the whole time, so checking isPending first would spin forever (instruction_mds/data-layer.md §5).
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
      {/* The width decision made above, handed to every destination so none re-measures it; and the
          merchant, because a destination's own params do not carry the shell's id. */}
      <ShellMerchantContext value={merchant}>
      <UnsavedGuardContext value={leaveGuard}>
      <ShellWideContext value={wide}>
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
          <SystemNav
            {...props}
            name={merchant.name}
            wide={wide}
            expanded={expanded}
            onExpandRail={() => setExpanded(true)}
          />
        )}
        screenOptions={{
          headerShown: false,
          drawerType: wide ? 'permanent' : 'front',
          drawerStyle: [wide ? styles.rail : styles.drawer, { backgroundColor: colors.primary, width: drawerWidth }],
          overlayColor: colors.backdrop,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        {ROUTES.map((route) => (
          <Drawer.Screen key={route.name} name={route.name} />
        ))}
      </Drawer>
      </ShellWideContext>
      </UnsavedGuardContext>
      </ShellMerchantContext>
    </View>
  );
}

type HeaderProps = {
  onMenu: () => void;
};

// Component A. Paper picks the title's variant (instruction_mds/typography.md rule 5), so only colour is passed.
function MerchantHeader({ onMenu }: HeaderProps) {
  const { colors } = useAppTheme();

  return (
    <Appbar.Header style={{ backgroundColor: colors.primary }}>
      <Appbar.Action icon="menu" color={colors.onPrimary} onPress={onMenu} accessibilityLabel="Menu" />
      <Appbar.Content title="Merchant" color={colors.onPrimary} />
      {/* Rendered, not wired: there is no notifications screen inside a system yet. */}
      <Appbar.Action icon="bell" color={colors.onPrimary} accessibilityLabel="Notifications" />
      <Appbar.Action
        icon="account"
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
  /** Tapping Resources on the icon-only rail widens the rail first, so its children are readable. */
  onExpandRail: () => void;
};

// Components B and C: the same header, divider and destinations, laid out as a rail when wide and as
// drawer rows when narrow. No system switcher — the way out of a system is Profile.
function SystemNav({ state, navigation, name, wide, expanded, onExpandRail }: NavProps) {
  const { colors } = useAppTheme();
  const leaveGuard = use(UnsavedGuardContext);
  const active = state.routes[state.index]?.name;
  // The drawer always shows labels; the rail shows them only while expanded.
  const labelled = !wide || expanded;
  // Open when one of the three is the screen being shown, so a reload into Inventory does not hide it.
  // Initial state only: after that the merchant's last tap on the group decides.
  const [resourcesOpen, setResourcesOpen] = useState(() => RESOURCES.some((entry) => entry.name === active));

  // A destination with unsaved changes gets to confirm first. Tapping the destination already open
  // switches nothing, so it is not asked.
  const go = (target: string) => {
    const navigate = () => navigation.navigate(target);
    const guard = leaveGuard.current;
    if (guard && target !== active) guard(navigate);
    else navigate();
  };

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

      <View style={styles.items}>
        {DESTINATIONS.map((entry) => {
          if ('group' in entry) {
            // Resources: no route of its own, so it is never "active" — it only opens and closes.
            return (
              <View key={entry.group}>
                <NavItem
                  label={entry.label}
                  icon={entry.icon}
                  wide={wide}
                  labelled={labelled}
                  trailing={resourcesOpen ? 'chevron-down' : 'chevron-right'}
                  expandedState={resourcesOpen}
                  onPress={() => {
                    // On the icon-only rail the children would be three unlabelled icons under an
                    // unlabelled one, so widening the rail is the first half of opening the group.
                    if (wide && !expanded) onExpandRail();
                    setResourcesOpen((open) => !open);
                  }}
                />
                {resourcesOpen
                  ? RESOURCES.map((child) => (
                      <NavItem
                        key={child.name}
                        label={child.label}
                        icon={child.icon}
                        wide={wide}
                        labelled={labelled}
                        nested
                        active={child.name === active}
                        onPress={() => go(child.name)}
                      />
                    ))
                  : null}
              </View>
            );
          }

          return (
            <NavItem
              key={entry.name}
              label={entry.label}
              icon={entry.icon}
              wide={wide}
              labelled={labelled}
              active={entry.name === active}
              onPress={() => go(entry.name)}
            />
          );
        })}
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
  /** One of the three screens under Resources: indented, and a step smaller. */
  nested?: boolean;
  /** The group row's chevron. */
  trailing?: IconName;
  /** The group row's open state, for the screen reader. */
  expandedState?: boolean;
  onPress: () => void;
};

// One rail or drawer row. Active: the lightened ground and the 4px accent bar. Inactive: no ground, no
// bar, 68%. The bar is a left border on every item, transparent when inactive, so selecting an item
// never shifts its content sideways (instruction_mds/visual-language.md §4).
function NavItem({ label, icon, wide, labelled, active, nested, trailing, expandedState, onPress }: ItemProps) {
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
      accessibilityState={{ selected: active, expanded: expandedState }}
      style={[
        styles.item,
        active ? { backgroundColor: colors.primaryHighlight, borderLeftColor: colors.accent } : styles.inactive,
      ]}
    >
      <View style={[wide ? styles.railItem : styles.drawerItem, nested && styles.nested]}>
        <Icon source={icon} size={wide ? 24 : 22} color={colors.onPrimary} />
        {labelled ? (
          <View style={styles.labelRow}>
            <Text
              variant="labelLarge"
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={[styles.fill, { color: colors.onPrimary }]}
            >
              {label}
            </Text>
            {trailing ? <Icon source={trailing} size={18} color={colors.onPrimary} /> : null}
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
  // takes the radius a Dialog-sized surface gets (instruction_mds/visual-language.md rule 4).
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
  railItem: { alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.ms, paddingLeft: spacing.ms, paddingRight: spacing.ms },
  // Label and chevron share a row in both anatomies: beside the icon in the drawer, under it in the
  // rail, where the item itself is a column.
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1, minWidth: 0 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingLeft: spacing.ms, paddingRight: spacing.md },
  // One step in from its group row, so the three Resources screens read as under it.
  nested: { paddingLeft: spacing.lg },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.lg },
});
