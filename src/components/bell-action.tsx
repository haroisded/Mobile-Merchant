import { StyleSheet, View } from 'react-native';

import { useUnreadNotificationsQuery } from '../features/notifications/queries';
import { useAppTheme } from '../lib/theme';
import { spacing } from '../themes';
import { Appbar } from './appbar';
import { Badge } from './badge';

/**
 * The app bar's bell with the unread count on it — on the wide systems list, where the tab bar and its badge are
 * hidden, and in a system's header. The count badge is accent (.claude/instruction_mds/frontend.md §2.3), as on the
 * Notifications tab.
 */
export function BellAction({ color, onPress }: { color?: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  const unread = useUnreadNotificationsQuery().data?.length ?? 0;

  return (
    <View>
      <Appbar.Action icon="bell" color={color} onPress={onPress} accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'} />
      <Badge visible={unread > 0} size={18} style={[styles.badge, { backgroundColor: colors.accent, color: colors.onAccent }]}>
        {unread > 99 ? '99+' : unread}
      </Badge>
    </View>
  );
}

const styles = StyleSheet.create({
  // On the bell's upper corner, inside the action's 48dp target.
  badge: { position: 'absolute', top: spacing.xs, right: spacing.xs },
});
