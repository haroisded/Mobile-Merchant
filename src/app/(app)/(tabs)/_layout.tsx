import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { StyleSheet, View } from 'react-native';

import { useColumns } from '../../../lib/columns';
import { ICONS } from '../../../lib/icons';
import { useAppTheme } from '../../../lib/theme';

// The merchant-level tab bar: the platform's own (instruction_mds/visual-language.md §5, `vercel-react-native-skills`
// `navigation-native-navigators`). Four tabs, under the five Android's native bar allows
// (react-native-screens TabsHost.kt:89) — which is also why the eight-destination merchant shell stays a
// Drawer.
//
// Nothing native reads PaperProvider, so every colour is passed from the theme. They are the roles
// Paper's own BottomNavigation.Bar resolved to before this moved (BottomNavigationBar.js:290, :460):
// `elevation.level2` for the bar, `secondaryContainer` for the active indicator. Icons are the same
// { ios, android } pairs Paper's renderer draws (src/lib/icons.tsx).
export default function TabsLayout() {
  const { colors } = useAppTheme();
  // On a wide container the M3 tablet layout has no bottom navigation — Home moves its actions into
  // the app bar — so the bar hides. The wrapper stays mounted either way: it is what reports the width.
  const { columns, onLayout } = useColumns();

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {/* Each trigger is declared explicitly so the tab ORDER is this list, not the order the files
          happen to be discovered in. Left to discovery, `account` would sort second instead of last. */}
      <NativeTabs
        hidden={columns > 1}
        // Android's bar labels only the selected tab by default, which hid three of the four labels
        // Paper's bar used to show.
        labelVisibilityMode="labeled"
        backgroundColor={colors.elevation.level2}
        indicatorColor={colors.secondaryContainer}
        rippleColor={colors.ripple}
        iconColor={{ default: colors.onSurfaceVariant, selected: colors.onSecondaryContainer }}
        labelStyle={{ default: { color: colors.onSurfaceVariant }, selected: { color: colors.onSurface } }}
        tintColor={colors.onSecondaryContainer}
      >
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf={ICONS.home.ios} md={ICONS.home.android} />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="notifications">
          <NativeTabs.Trigger.Icon sf={ICONS.bell.ios} md={ICONS.bell.android} />
          <NativeTabs.Trigger.Label>Notifications</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Icon sf={ICONS.settings.ios} md={ICONS.settings.android} />
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="account">
          <NativeTabs.Trigger.Icon sf={ICONS.account.ios} md={ICONS.account.android} />
          <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
