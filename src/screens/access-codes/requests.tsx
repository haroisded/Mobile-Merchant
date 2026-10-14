import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FilterChips } from '../../components/filter-chips';
import { RecordList, StatusText } from '../../components/record-list';
import { formatCode } from '../../features/access-codes/code';
import { useAccessRequestsQuery } from '../../features/access-requests/queries';
import { memberName } from '../../features/members/queries';
import { displayDateTime } from '../../lib/dates';
import { spacing } from '../../themes';

type Filter = 'pending' | 'approved' | 'declined' | 'all';

const STATUS_WORD = new Map([
  ['pending', 'Pending'],
  ['approved', 'Approved'],
  ['declined', 'Declined'],
]);

export const statusOf = (request: { status: string }) => STATUS_WORD.get(request.status) ?? request.status;

/** Everyone who used one of the owner's codes — those still waiting, unless another filter is picked. A request opens to approve or decline. */
export function Requests() {
  const requests = useAccessRequestsQuery();
  const [filter, setFilter] = useState<Filter>('pending');
  const count = (status: Filter) => requests.data?.filter((request) => status === 'all' || request.status === status).length ?? 0;
  const found = requests.data?.filter((request) => filter === 'all' || request.status === filter);

  const filters: { value: Filter; label: string }[] = [
    { value: 'pending', label: `Pending · ${count('pending')}` },
    { value: 'approved', label: 'Approved' },
    { value: 'declined', label: 'Declined' },
    { value: 'all', label: 'All' },
  ];

  return (
    <View style={styles.fill}>
      <View style={styles.toolbar}>
        <FilterChips options={filters} value={filter} onChange={setFilter} />
      </View>
      <RecordList
        query={{ ...requests, data: found }}
        keyOf={(request) => request.id}
        columns={[
          { label: 'Name', flex: 2, cell: memberName },
          { label: 'Email', flex: 2.5, cell: (request) => request.email ?? '' },
          { label: 'System', flex: 2, cell: (request) => request.merchant_name },
          { label: 'Code', flex: 1.2, cell: (request) => formatCode(request.code) },
          { label: 'Asked', flex: 1.6, cell: (request) => displayDateTime(request.created_at) },
          { label: 'Status', flex: 1.2, cell: () => '', node: (request) => <StatusText words={[statusOf(request)]} faint={request.status === 'declined'} /> },
        ]}
        title={memberName}
        subtitle={(request) => [request.full_name ? request.email : null, request.merchant_name, `via ${formatCode(request.code)}`].filter(Boolean).join(' · ')}
        status={(request) => <StatusText words={[statusOf(request), displayDateTime(request.created_at)]} faint={request.status === 'declined'} />}
        accessibilityLabel={(request) => `Request from ${memberName(request)}, ${statusOf(request)}`}
        onPress={(request) => router.push({ pathname: '/forms/access-request', params: { requestId: request.id } })}
        empty={filter === 'pending' ? 'Nobody is waiting. When someone uses one of your codes, they show up here.' : 'No requests here.'}
        offline="You're offline. Requests will load when you reconnect."
        failure="Couldn't load requests. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  toolbar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.ms },
});
