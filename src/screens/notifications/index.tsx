import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Appbar } from '../../components/appbar';
import { Avatar } from '../../components/avatar';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { QueryState } from '../../components/query-state';
import { Surface } from '../../components/surface';
import { Text } from '../../components/text';
import { useMarkNotificationsReadMutation, useNotificationsQuery } from '../../features/notifications/queries';
import type { Notification } from '../../features/notifications/queries';
import { useBottomInset, useShellWide } from '../../lib/columns';
import { displayDateTime } from '../../lib/dates';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';

const KIND_ICON = new Map([
  ['access_requested', 'key'],
  ['access_approved', 'check'],
  ['access_declined', 'close'],
  ['access_removed', 'person-remove'],
  ['access_changed', 'shield'],
]);

/** Where a notification leads: the requests to approve, or the system just opened to the reader or changed for them. */
function open(notification: Notification) {
  if (notification.kind === 'access_requested') router.navigate({ pathname: '/access-codes', params: { pane: 'requests' } });
  if ((notification.kind === 'access_approved' || notification.kind === 'access_changed') && notification.merchant_id) {
    router.push({ pathname: '/systems/[id]', params: { id: notification.merchant_id } });
  }
}

/**
 * The signed-in person's notifications, newest first: someone used their code, their request was decided, they were
 * removed from a system. A tap marks one read and opens what it is about. Nothing pushes them yet: the list is asked
 * for again on coming back to the app, and the badge every minute (src/features/notifications/queries.ts).
 */
export function NotificationsScreen() {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const bottom = useBottomInset();
  const notifications = useNotificationsQuery();
  const markRead = useMarkNotificationsReadMutation();
  const unread = notifications.data?.filter((notification) => notification.read_at === null).length ?? 0;

  const press = (notification: Notification) => {
    if (notification.read_at === null) markRead.mutate([notification.id]);
    open(notification);
  };

  return (
    <Surface style={styles.screen}>
      <Appbar.Header>
        {/* A page the bell pushes, from Home or from a store's header: Back returns there. */}
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Notifications" />
      </Appbar.Header>
      <FlatList
        // Wide, the rows are held to the reading measure, left-aligned: never one row across a tablet (rule 16).
        style={wide ? styles.measure : undefined}
        contentContainerStyle={{ paddingBottom: bottom }}
        data={notifications.data ?? []}
        keyExtractor={(notification) => notification.id}
        ListHeaderComponent={
          unread > 0 ? (
            <View style={styles.toolbar}>
              <Button mode="text" textColor={colors.accent} onPress={() => markRead.mutate('all')} disabled={markRead.isPending}>
                Mark all as read
              </Button>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.state}>
            <QueryState query={notifications} offline="You're offline. Notifications will load when you reconnect." failure="Couldn't load notifications. Try again.">
              <Text variant="bodyMedium">Nothing yet. When someone uses your code, or an owner answers yours, it shows up here.</Text>
            </QueryState>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => press(item)}
            // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
            android_ripple={{ color: colors.ripple }}
            accessibilityRole="button"
            accessibilityLabel={`${item.read_at === null ? 'Unread. ' : ''}${item.title}. ${item.body ?? ''}`}
            style={[styles.row, { borderBottomColor: colors.surfaceVariant }, item.read_at === null ? { backgroundColor: colors.surfaceMuted } : null]}
          >
            <Avatar.Icon size={40} icon={KIND_ICON.get(item.kind) ?? 'bell'} />
            <View style={styles.text}>
              <Text variant="titleMedium">{item.title}</Text>
              {item.body ? <Text variant="bodyMedium">{item.body}</Text> : null}
              <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                {displayDateTime(item.created_at)}
              </Text>
            </View>
            {/* Unread: a dot in the accent, as a count badge is (.claude/instruction_mds/frontend.md §2.3). */}
            <Badge visible={item.read_at === null} size={10} style={{ backgroundColor: colors.accent }} />
          </Pressable>
        )}
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  measure: { width: '100%' },
  toolbar: { alignItems: 'flex-start', paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, paddingHorizontal: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1 },
  text: { flex: 1, gap: spacing.xs },
});
