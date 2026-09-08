// From expo-router, not from '@react-navigation/bottom-tabs': SDK 57 vendors react-navigation
// inside expo-router and does not install it as a package, so that import has nothing to resolve.
// js-tabs re-exports the vendored bottom-tabs types (build/layouts/Tabs.d.ts:2).
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { BottomNavigation } from 'react-native-paper';

import { useColumns } from '../../../lib/columns';

// Icon and label per route, keyed by the route's file name. An array rather than a lookup object so
// the match is a plain comparison — indexing a Record<string, …> with `route.name` would need a
// type assertion, which .oxlintrc.json rejects.
//
// Order here is only metadata; the tab ORDER comes from the <Tabs.Screen> declarations below.
const TAB_META = [
  { name: 'index', title: 'Home', focusedIcon: 'home', unfocusedIcon: 'home-outline' },
  { name: 'notifications', title: 'Notifications', focusedIcon: 'bell', unfocusedIcon: 'bell-outline' },
  { name: 'settings', title: 'Settings', focusedIcon: 'cog', unfocusedIcon: 'cog-outline' },
  { name: 'account', title: 'Account', focusedIcon: 'account', unfocusedIcon: 'account-outline' },
];

// Paper's own bottom bar rather than the default React Navigation one, so the active indicator,
// elevation and colour roles are MD3's without a single colour being passed by hand: the Bar
// already resolves its background to theme.colors.elevation.level2 and its active indicator to
// secondaryContainer (BottomNavigationBar.js:290, :460). Those are the roles the M3 analysis asks
// for under the names `surfaceContainer` and `secondaryContainer` — the first of which does not
// exist in Paper 5.15.3, which is why the substitution is "pass nothing".
function PaperTabBar({ state, navigation, insets }: BottomTabBarProps) {
  // The bar measures itself. On a wide container the M3 tablet layout has no bottom navigation at
  // all — it swaps to a wider content grid with the actions in the app bar — so the bar simply does
  // not render there.
  //
  // The wrapper View stays mounted and full-width either way. If it unmounted with the bar it would
  // stop reporting a width, columns would fall back to 1, and the bar would reappear: a measure /
  // render loop.
  const { columns, onLayout } = useColumns();

  return (
    <View onLayout={onLayout}>
      {columns === 1 ? (
        <BottomNavigation.Bar
          navigationState={{
            index: state.index,
            routes: state.routes.map((route) => {
              const meta = TAB_META.find((tab) => tab.name === route.name);
              return {
                key: route.key,
                title: meta?.title ?? route.name,
                focusedIcon: meta?.focusedIcon,
                unfocusedIcon: meta?.unfocusedIcon,
              };
            }),
          }}
          safeAreaInsets={insets}
          onTabPress={({ route, preventDefault }) => {
            // The Bar hands back the route object it was given, whose `key` is the real navigation
            // key — so find the source route by key rather than by title.
            const target = state.routes.find((candidate) => candidate.key === route.key);
            if (!target) return;

            // Emit the event first and honour a listener that cancels it; skipping this breaks
            // scroll-to-top-on-retap and any other tabPress handler a screen registers.
            const event = navigation.emit({
              type: 'tabPress',
              target: target.key,
              canPreventDefault: true,
            });

            if (event.defaultPrevented) {
              preventDefault();
              return;
            }

            navigation.navigate(target.name);
          }}
        />
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  // `Tabs` from expo-router/js-tabs, not from 'expo-router' — the root export is @deprecated in
  // SDK 57 (expo-router/build/exports.d.ts:41) and points here.
  //
  // Each screen is declared explicitly so the tab ORDER is this list, not the order the files
  // happen to be discovered in. Left to discovery, `account` would sort second instead of last.
  return (
    <Tabs tabBar={(props) => <PaperTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="notifications" />
      <Tabs.Screen name="settings" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
