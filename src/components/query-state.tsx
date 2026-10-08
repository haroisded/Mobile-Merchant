import type { ReactNode } from 'react';

import { failureMessage } from '../lib/errors';
import { ActivityIndicator } from './activity-indicator';
import { Button } from './button';
import { Text } from './text';

type Props = {
  query: { data: unknown; isPaused: boolean; isPending: boolean; isError: boolean; refetch: () => void };
  /** "You're offline. Suppliers will load when you reconnect." */
  offline: string;
  /** The failure copy, passed through failureMessage(). */
  failure: string;
  /** What shows once the query has loaded — usually the empty state. */
  children?: ReactNode;
};

/**
 * The states before a query's data: offline, loading, failed — then `children`. Paused first: a query
 * with no connection is queued, not failed, and isPending stays true the whole time
 * (.claude/instruction_mds/data-layer.md §5). A refetch paused over data already loaded falls through to
 * `children`. No retry offline — the query resumes on its own. The caller owns the layout around it.
 */
export function QueryState({ query, offline, failure, children }: Props) {
  if (query.isPaused && query.data === undefined) return <Text variant="bodyMedium">{offline}</Text>;
  if (query.isPending) return <ActivityIndicator />;
  if (query.isError) {
    return (
      <>
        <Text variant="bodyMedium">{failureMessage(failure)}</Text>
        <Button onPress={() => query.refetch()}>Try again</Button>
      </>
    );
  }
  return children;
}
