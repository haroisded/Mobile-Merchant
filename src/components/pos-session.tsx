import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PageHeader } from './page-header';
import { QueryState } from './query-state';
import { Text } from './text';
import { openSession, usePosOpeningEntriesQuery } from '../features/pos-opening-entries/queries';
import { usePosProfilesQuery } from '../features/pos-profiles/queries';
import { useSession } from '../Store/StoreUser';
import { spacing } from '../themes';

/**
 * The session the signed-in cashier is selling in, and its POS Profile — what the Register, the Cart and
 * Sell's own page all start from. `sessionId` asks for one session by id instead: a manager closing a
 * session its cashier left open. `query` is the sessions' own, for the states before them.
 */
export function useRegisterSession(merchantId: string, sessionId?: string) {
  const userId = useSession()?.user.id;
  const query = usePosOpeningEntriesQuery({ merchantId });
  const profiles = usePosProfilesQuery({ merchantId }).data;
  const session = sessionId ? query.data?.find((entry) => entry.id === sessionId && entry.status === 'Open') : openSession(query.data, userId);

  return { query, session, profile: profiles?.find((candidate) => candidate.id === session?.pos_profile_id) };
}

/** A session's page before its session: loading, offline, failed — or no session open. */
export function SessionState({ title, query }: { title: string; query: ReturnType<typeof useRegisterSession>['query'] }) {
  return (
    <View style={styles.fill}>
      <PageHeader kicker="Sell" title={title} onBack={() => router.back()} />
      <View style={styles.state}>
        <QueryState query={query} offline="You're offline. Your session will load when you reconnect." failure="Couldn't load your session. Try again.">
          <Text variant="bodyMedium">No session is open. Go back to Sell and open one.</Text>
        </QueryState>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
});
