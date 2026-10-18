import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { FilterChips } from '../../components/filter-chips';
import { RecordList } from '../../components/record-list';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import { codeStatus, expiryText, formatCode } from '../../features/access-codes/code';
import type { CodeStatus } from '../../features/access-codes/code';
import { useAccessCodesQuery } from '../../features/access-codes/queries';
import type { AccessCode } from '../../features/access-codes/queries';
import type { Merchant } from '../../features/merchants/queries';
import { useShellWide } from '../../lib/columns';
import { displayDate, storedDate } from '../../lib/dates';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';

const FILTERS: { value: 'all' | CodeStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'claimed', label: 'Claimed' },
  { value: 'used', label: 'Used' },
  { value: 'expired', label: 'Expired' },
];

export const STATUS_LABEL = { active: 'Active', claimed: 'Claimed', used: 'Used', expired: 'Expired' } satisfies Record<CodeStatus, string>;

const TICK = 30 * 1000;

/** The time, moved on every 30 seconds — so a code's minutes left, and its status, keep up while it is on screen. */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// ponytail: the device's calendar, not the system's. A custom expiry is the end of a day where the system is, so a
// phone in another time zone can name the day beside it; read the system's time zone per code if owners travel.
export const lastDay = (beforeExpiry: Date) => displayDate(storedDate(beforeExpiry));

/** "1 of 1 used" — the approved; a pending request is what Claimed says. */
export function usesText(code: AccessCode) {
  if (code.max_uses === null) return 'Many people';
  return `${code.access_requests.filter((request) => request.status === 'approved').length} of ${code.max_uses} used`;
}

/** The codes of every store the owner has, newest first: searched, filtered by status, opened to share or delete. */
export function Codes({ owned }: { owned: Merchant[] }) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const codes = useAccessCodesQuery();
  const now = useNow();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | CodeStatus>('all');

  const status = (code: AccessCode) => codeStatus(code, code.access_requests, now);
  const tone = (code: AccessCode) => {
    const current = status(code);
    if (current === 'expired') return colors.error;
    return current === 'used' ? colors.onSurfaceFaint : colors.onSurface;
  };
  // A Set: an expired code's expiry says Expired too, once is enough.
  const words = (code: AccessCode) => [...new Set([STATUS_LABEL[status(code)], expiryText(code.expires_at, now, lastDay), usesText(code)])].join(' · ');
  const needle = search.trim().toLowerCase();
  const found = codes.data?.filter(
    (code) =>
      (filter === 'all' || status(code) === filter) &&
      [code.label ?? '', code.code, formatCode(code.code), code.merchants?.name ?? ''].some((text) => text.toLowerCase().includes(needle))
  );

  const create = (
    <Button mode="contained" icon="add" onPress={() => router.push('/forms/new-access-code')} disabled={owned.length === 0} contentStyle={styles.leading}>
      Create Code
    </Button>
  );
  const searchField = (
    <TextInput
      mode="outlined"
      dense
      value={search}
      onChangeText={setSearch}
      placeholder="Search by label, code or store"
      accessibilityLabel="Search codes"
      left={<TextInput.Icon icon="search" />}
      style={wide ? styles.grow : undefined}
    />
  );

  return (
    <View style={styles.fill}>
      <View style={styles.toolbar}>
        {wide ? (
          <View style={styles.row}>
            {searchField}
            {create}
          </View>
        ) : (
          <>
            {create}
            {searchField}
          </>
        )}
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      </View>
      <RecordList
        query={{ ...codes, data: found }}
        keyOf={(code) => code.id}
        columns={[
          { label: 'Code', flex: 2, cell: (code) => code.label ?? formatCode(code.code) },
          { label: 'Store', flex: 2, cell: (code) => code.merchants?.name ?? '' },
          {
            label: 'Status',
            flex: 1,
            cell: () => '',
            node: (code) => (
              <Text variant="labelMedium" style={{ color: tone(code) }}>
                {STATUS_LABEL[status(code)]}
              </Text>
            ),
          },
          { label: 'Expires', flex: 1.5, cell: (code) => expiryText(code.expires_at, now, lastDay) },
          { label: 'Uses', flex: 1.5, cell: usesText },
        ]}
        title={(code) => code.label ?? formatCode(code.code)}
        subtitle={(code) => [code.label ? formatCode(code.code) : null, code.merchants?.name].filter(Boolean).join(' · ')}
        status={(code) => (
          <Text variant="labelMedium" style={{ color: tone(code) }}>
            {words(code)}
          </Text>
        )}
        accessibilityLabel={(code) => `Code ${formatCode(code.code)}, ${words(code)}`}
        onPress={(code) => router.push({ pathname: '/forms/access-code', params: { codeId: code.id } })}
        empty={needle || filter !== 'all' ? 'No code matches.' : 'No codes yet. Create one and send it to the person you want to let in.'}
        offline="You're offline. Your codes will load when you reconnect."
        failure="Couldn't load your codes. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  leading: { justifyContent: 'flex-start' },
  toolbar: { gap: spacing.ms, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.ms },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms },
});
