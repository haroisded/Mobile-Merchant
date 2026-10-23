import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Appbar } from '../../components/appbar';
import { Button } from '../../components/button';
import { CellRows } from '../../components/cell-rows';
import { Surface } from '../../components/surface';
import { Text } from '../../components/text';
import { fontScaled, READING_MEASURE, useBottomInset, useColumns, useShellWide } from '../../lib/columns';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';
import { RoleListDialog } from './role-list';
import { LIMITS, PERMISSIONS } from './roles';

/** The permission areas, in the catalog's order, each with its permissions. */
const AREAS = [...new Set(PERMISSIONS.map((permission) => permission.area))].map((area) => ({
  area,
  labels: PERMISSIONS.filter((permission) => permission.area === area).map((permission) => permission.label),
}));

/** What the practice store promises, as the hero's pills. */
const PROMISES = ['Nothing is saved', 'Works offline', 'Leaving resets it'];

// The narrowest an area card or a note card may be before the grid drops a column; cards per row are capped
// (three areas, two notes), as the reference lays them out.
const AREA_CARD = 320;
const NOTE_CARD = 360;

/**
 * The Store Guide (.claude/instruction-mds/frontend.md §5, Store Guide): a page, opened from the Home tab, whose role
 * list pops up as it opens — a native sheet on a phone, a Dialog over the page on a tablet. A role opens its practice
 * store (/guide/<role>). The page is a hero on `primary` (what a role is, and Choose a Role to reopen the list), the 20
 * permissions as a card per area, and the limits of roles today as numbered cards — both grids measured from their
 * container (useColumns), one column on a phone.
 */
export function GuideScreen() {
  const wide = useShellWide();
  const { colors } = useAppTheme();
  const [listOpen, setListOpen] = useState(false);
  const popped = useRef(false);
  const areaGrid = useColumns(fontScaled(AREA_CARD));
  const noteGrid = useColumns(fontScaled(NOTE_CARD));
  const areaColumns = Math.min(3, areaGrid.columns);
  const noteColumns = Math.min(2, noteGrid.columns);
  const bottom = useBottomInset();

  // Narrow, the list is a sheet route over this page; wide, a Dialog on it. Either way it pops up once, on opening.
  // A quick second tap must not push a second sheet (emulator, 2026-10-22: two stacked, one Back left the other), so a
  // push holds until this page is in front again.
  const sheetPushed = useRef(false);
  useFocusEffect(
    useCallback(() => {
      sheetPushed.current = false;
    }, []),
  );
  const openList = () => {
    if (wide) return setListOpen(true);
    if (sheetPushed.current) return;
    sheetPushed.current = true;
    router.push('/sheets/guide-roles');
  };
  useEffect(() => {
    if (popped.current) return;
    popped.current = true;
    openList();
  });

  return (
    <Surface style={styles.fill}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Store Guide" />
      </Appbar.Header>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: spacing.xl + bottom }]}>
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <Text variant="labelMedium" style={{ color: colors.accent }}>
            Store Guide
          </Text>
          <Text variant="displaySmall" style={{ color: colors.onPrimary }}>
            Learn a role
          </Text>
          <Text variant="bodyLarge" style={[styles.measure, { color: colors.onPrimary }]}>
            A role is the set of permissions an owner gives a person on Employees. Pick a role and a practice store opens with
            only the screens that role reaches, a list of its tasks, and step-by-step help for each.
          </Text>
          <View style={styles.pills}>
            {PROMISES.map((promise) => (
              <View key={promise} style={[styles.pill, { backgroundColor: colors.primaryHighlight }]}>
                <Text variant="bodySmall" style={{ color: colors.onPrimary }}>
                  {promise}
                </Text>
              </View>
            ))}
          </View>
          <Button
            mode="contained"
            icon="checklist"
            buttonColor={colors.accent}
            textColor={colors.onAccent}
            onPress={openList}
            style={wide ? styles.contentWidth : undefined}
            contentStyle={styles.leading}
          >
            Choose a Role
          </Button>
        </View>

        <Heading title="The 20 permissions" hint="Grouped by area" />
        <CellRows
          items={AREAS}
          columns={areaColumns}
          onLayout={areaGrid.onLayout}
          keyOf={(entry) => entry.area}
          rowGap={spacing.ms}
          columnGap={spacing.ms}
          render={(entry) => (
            <View style={[styles.card, { borderColor: colors.outlineVariant }]}>
              <View style={styles.cardHead}>
                <Text variant="labelMedium" style={[styles.shrink, { color: colors.secondary }]}>
                  {entry.area}
                </Text>
                <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                  {entry.labels.length}
                </Text>
              </View>
              <View style={styles.tags}>
                {entry.labels.map((label) => (
                  <View key={label} style={[styles.tag, { backgroundColor: colors.surfaceVariant }]}>
                    <Text variant="bodySmall">{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        />

        <Heading title="Good to know" hint="Limits of roles today" />
        <CellRows
          items={LIMITS.map((limit, index) => ({ ...limit, number: index + 1 }))}
          columns={noteColumns}
          onLayout={noteGrid.onLayout}
          keyOf={(limit) => limit.topic}
          rowGap={spacing.ms}
          columnGap={spacing.ms}
          render={(limit) => (
            <View style={[styles.card, styles.note, { borderColor: colors.outlineVariant }]}>
              <View style={[styles.number, { backgroundColor: colors.surfaceMuted }]}>
                <Text variant="labelLarge" style={{ color: colors.accent }}>
                  {limit.number}
                </Text>
              </View>
              <View style={styles.noteText}>
                <Text variant="titleMedium">{limit.topic}</Text>
                <Text variant="bodyMedium" style={{ color: colors.onSurfaceMuted }}>
                  {limit.detail}
                </Text>
              </View>
            </View>
          )}
        />
      </ScrollView>
      {listOpen ? (
        <RoleListDialog
          onDismiss={() => setListOpen(false)}
          onPick={(role) => {
            setListOpen(false);
            router.push({ pathname: '/guide/[role]', params: { role: role.id } });
          }}
        />
      ) : null}
    </Surface>
  );
}

/** A section's heading, its hint at the far end of the same row (frontend.md §5, Section heading). */
function Heading({ title, hint }: { title: string; hint: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.heading}>
      <Text variant="headlineSmall" style={styles.shrink}>
        {title}
      </Text>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
  hero: { gap: spacing.ms, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg },
  measure: { maxWidth: READING_MEASURE },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: { borderRadius: radius.xl, borderCurve: 'continuous', paddingHorizontal: spacing.ms, paddingVertical: spacing.xs },
  contentWidth: { alignSelf: 'flex-start' },
  leading: { justifyContent: 'flex-start' },
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, paddingTop: spacing.md },
  shrink: { flexShrink: 1, flexGrow: 1 },
  // Fills its CellRows cell, so every card in a row is as tall as the tallest.
  card: { flexGrow: 1, gap: spacing.ms, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: { borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  note: { flexDirection: 'row', alignItems: 'flex-start' },
  number: { minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderCurve: 'continuous' },
  noteText: { flex: 1, gap: spacing.xs },
});
