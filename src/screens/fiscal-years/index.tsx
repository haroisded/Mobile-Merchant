import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { DataTable } from '../../components/data-table';
import { HeaderTitle } from '../../components/header-title';
import { NoteCallout } from '../../components/note-callout';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { Text } from '../../components/text';
import { useFiscalYearsQuery } from '../../features/fiscal-years/queries';
import type { FiscalYear } from '../../features/fiscal-years/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useTableFits } from '../../lib/columns';
import { displayDate, todayDate } from '../../lib/dates';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';

type Props = { merchantId: string };

const openForm = (merchantId: string, fiscalYearId?: string) =>
  router.push({ pathname: '/forms/fiscal-year', params: fiscalYearId ? { merchantId, fiscalYearId } : { merchantId } });

/**
 * Fiscal Years (docs.frappe.io/erpnext/fiscal-year): the accounting years of this system's company. A
 * transaction can only be posted inside one, so a day no year covers is called out at the top. A table
 * when wide, rows when narrow; a short bounded list, so FlatList (.claude/instruction_mds/frontend.md §4.2).
 */
export function FiscalYears({ merchantId }: Props) {
  const { colors } = useAppTheme();
  const table = useTableFits();
  const years = useFiscalYearsQuery({ merchantId });
  const permissions = usePermissions({ merchantId }).data;
  const rows = years.data ?? [];
  const today = todayDate();
  // A sale can only be posted on a day an enabled year holds. Told only to whom may add the missing year:
  // a helper a User Permission holds to other years sees too few to judge.
  // ponytail: a restricted helper who may create still gets it; ask the server if that role appears.
  const uncovered =
    can(permissions, 'Fiscal Year', 'create') &&
    years.data !== undefined &&
    !rows.some((year) => !year.disabled && year.year_start_date <= today && today <= year.year_end_date);

  const empty = (
    <View style={styles.state}>
      <QueryState query={years} offline="You're offline. Fiscal years will load when you reconnect." failure="Couldn't load fiscal years. Try again.">
        <Text variant="bodyMedium">No fiscal years yet.</Text>
      </QueryState>
    </View>
  );

  const list = (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={empty}
      renderItem={({ item }) => <YearRow item={item} wide={table} onPress={() => openForm(merchantId, item.id)} />}
    />
  );

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Fiscal Years"
        // No count until the list has loaded: "0 years" while offline would read as an empty list.
        meta={years.data ? `${rows.length} ${rows.length === 1 ? 'year' : 'years'}` : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Fiscal Year', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openForm(merchantId)} contentStyle={styles.leading}>
              New Fiscal Year
            </Button>
          ) : null
        }
      />
      {uncovered ? (
        <View style={styles.note}>
          <NoteCallout tone="error">
            {`No enabled fiscal year covers today, ${displayDate(today)}. A sale dated today could not be posted — add the year that holds it.`}
          </NoteCallout>
        </View>
      ) : null}
      {table ? (
        <DataTable style={styles.fill}>
          <DataTable.Header style={{ borderBottomColor: colors.outlineVariant }}>
            <HeaderTitle label="Year" style={styles.nameCell} />
            <HeaderTitle label="Starts" style={styles.dateCell} />
            <HeaderTitle label="Ends" style={styles.dateCell} />
            <HeaderTitle label="Status" style={styles.statusCell} />
          </DataTable.Header>
          {list}
        </DataTable>
      ) : (
        list
      )}
    </View>
  );
}

/** "Default", "Disabled" or "Short year" — the status column, in the colours of .claude/instruction_mds/frontend.md §2.4. */
function YearStatus({ item }: { item: FiscalYear }) {
  const { colors } = useAppTheme();
  const words = [item.is_default ? 'Default' : null, item.is_short_year ? 'Short year' : null, item.disabled ? 'Disabled' : null].filter(
    (word) => word !== null
  );

  return (
    <Text variant="labelMedium" style={{ color: item.disabled ? colors.onSurfaceFaint : colors.onSurface }}>
      {words.join(' · ')}
    </Text>
  );
}

function YearRow({ item, wide, onPress }: { item: FiscalYear; wide: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const span = `${displayDate(item.year_start_date)} – ${displayDate(item.year_end_date)}`;

  return (
    <Pressable
      onPress={onPress}
      // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
      android_ripple={{ color: colors.ripple }}
      accessibilityRole="button"
      accessibilityLabel={`Fiscal year ${item.year}, ${span}`}
      style={[wide ? styles.tableRow : styles.cardRow, { borderBottomColor: colors.surfaceVariant }]}
    >
      {wide ? (
        <>
          <Text variant="titleMedium" style={styles.nameCell}>
            {item.year}
          </Text>
          <Text variant="bodyMedium" style={styles.dateCell}>
            {displayDate(item.year_start_date)}
          </Text>
          <Text variant="bodyMedium" style={styles.dateCell}>
            {displayDate(item.year_end_date)}
          </Text>
          <View style={styles.statusCell}>
            <YearStatus item={item} />
          </View>
        </>
      ) : (
        <View style={styles.cardText}>
          <Text variant="titleMedium">{item.year}</Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
            {span}
          </Text>
          <YearStatus item={item} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  note: { paddingHorizontal: spacing.md, paddingTop: spacing.ms },
  leading: { justifyContent: 'flex-start' },
  tableRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  nameCell: { flex: 1, paddingRight: spacing.sm },
  dateCell: { flex: 1.2, paddingRight: spacing.sm },
  statusCell: { flex: 1.4 },
  cardRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1 },
  cardText: { gap: spacing.xs },
});
