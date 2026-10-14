import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useUnreadNotificationsQuery } from '../../../features/notifications/queries';
import { useShellWide } from '../../../lib/columns';
import { ICONS } from '../../../lib/icons';
import { useAppTheme } from '../../../lib/theme';

// The merchant-level tab bar: the platform's own (.claude/instruction_mds/frontend.md rule 2, `vercel-react-native-skills`
// `navigation-native-navigators`). Five tabs, the most Android's native bar allows
// (react-native-screens TabsHost.kt:89) — which is also why the eight-destination merchant shell stays a
// Drawer. A sixth needs a home elsewhere: the bar crashes past five (.claude/instruction_mds/frontend.md §7).
//
// Nothing native reads PaperProvider, so every colour is passed from the theme. They are the roles
// Paper's own BottomNavigation.Bar resolved to before this moved (BottomNavigationBar.js:290, :460):
// `elevation.level2` for the bar, `secondaryContainer` for the active indicator. Icons are the same
// { ios, android } pairs Paper's renderer draws (src/lib/icons.tsx).
export default function TabsLayout() {
  const { colors } = useAppTheme();
  // On a wide window the M3 tablet layout has no bottom navigation — Home moves its actions into the
  // app bar — so the bar hides, at the same threshold as everything else (.claude/instruction_mds/frontend.md §4.1).
  const wide = useShellWide();
  // Polled here, so the badge keeps counting on every tab (src/features/notifications/queries.ts).
  const unread = useUnreadNotificationsQuery().data?.length ?? 0;

  return (
    <>
      {/* Each trigger is declared explicitly so the tab ORDER is this list, not the order the files
          happen to be discovered in. Left to discovery, `account` would sort second instead of last. */}
      <NativeTabs
        hidden={wide}
        // Android's bar labels only the selected tab by default, which hid all but one of the labels
        // Paper's bar used to show.
        labelVisibilityMode="labeled"
        backgroundColor={colors.elevation.level2}
        indicatorColor={colors.secondaryContainer}
        rippleColor={colors.ripple}
        iconColor={{ default: colors.onSurfaceVariant, selected: colors.onSecondaryContainer }}
        labelStyle={{ default: { color: colors.onSurfaceVariant }, selected: { color: colors.onSurface } }}
        tintColor={colors.onSecondaryContainer}
        // The unread count, a count badge: accent (.claude/instruction_mds/frontend.md §2.3).
        badgeBackgroundColor={colors.accent}
        badgeTextColor={colors.onAccent}
      >
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf={ICONS.home.ios} md={ICONS.home.android} />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="access-codes">
          <NativeTabs.Trigger.Icon sf={ICONS.key.ios} md={ICONS.key.android} />
          <NativeTabs.Trigger.Label>Access Codes</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="notifications">
          <NativeTabs.Trigger.Icon sf={ICONS.bell.ios} md={ICONS.bell.android} />
          <NativeTabs.Trigger.Label>Notifications</NativeTabs.Trigger.Label>
          {/* Left out at 0, not `hidden`: a Badge with children shows them whatever `hidden` says
              (expo-router NativeTabTrigger.js appendBadgeOptions) — it read "0" on the phone, 2026-10-14. */}
          {unread > 0 ? <NativeTabs.Trigger.Badge>{unread > 99 ? '99+' : String(unread)}</NativeTabs.Trigger.Badge> : null}
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
    </>
  );
}
